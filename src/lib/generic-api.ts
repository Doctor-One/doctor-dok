import { BaseRepository } from "@/data/server/base-repository";
import { getErrorMessage, getZedErrorMessage } from "./utils";
import { ZodError, ZodObject } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { authorizeKey, deleteTemporaryServerKey } from "@/data/server/server-key-helpers";
import { jwtVerify } from "jose";
import { AuthorizationUrlZones, defaultKeyACL, KeyACLDTO, KeyAuthorizationZone, KeyDTO, keyHashParamsDTOSchema, SaaSDTO } from "@/data/dto";
import { Key } from "react";
import { PlatformApiClient } from "@/data/server/platform-api-client";
import NodeCache from "node-cache";
import { ApiError } from "@/data/dto";
import { DTOEncryptionFilter, EncryptionUtils } from "@/lib/crypto";
import { otpManager } from "./otp-manager";
import { getEnclaveRequestAuthorization } from "./enclave-helpers";
import { hash, verify } from 'argon2';

const saasCtxCache = new NodeCache({ stdTTL: 60 * 60 * 10 /* 10 min cache */ });

export class AuthorizationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthorizationError';
    }
}


export type ApiResult = {
    message: string;
    data?: any;
    error?: any
    issues?: any[];
    status: 200 | 400 | 500;
}

export type AuthorizedRequestContext = {
    databaseIdHash: string;
    keyHash: string;
    keyLocatorHash: string;
    acl: KeyACLDTO;
    extra: any;
    masterKey: string | null;
    encryptionKey: string | null;
    serverCommunicationKey: string | null;
    deleteTemporaryServerKey: () => Promise<boolean>;
}

export type AuthorizedSaaSContext = {
    saasContex: SaaSDTO | null
    isSaasMode: boolean
    hasAccess: boolean;
    error?: string;
    apiClient: PlatformApiClient | null
}

export async function authorizeSaasContext(request: NextRequest, forceNoCache: boolean = false): Promise<AuthorizedSaaSContext> {
    if (!process.env.SAAS_PLATFORM_URL) {
        return {
            saasContex: null,
            hasAccess: true,
            isSaasMode: false,
            apiClient: null
        }
    } else {

        const useCache = forceNoCache ? false : (request.nextUrl.searchParams.get('useCache') === 'false' ? false : true);
        const saasToken = request.headers.get('saas-token') !== null ? request.headers.get('saas-token') : request.nextUrl.searchParams.get('saasToken');
        const databaseIdHash = request.headers.get('database-id-hash') !== null ? request.headers.get('database-id-hash') : request.nextUrl.searchParams.get('databaseIdHash');
        if (!saasToken && !databaseIdHash) {
            return {
                saasContex: null,
                isSaasMode: false,
                hasAccess: false,
                apiClient: null,
                error: 'No SaaS Token / Database Id Hash provided. Please register your account / apply for beta tests on official landing page.'
            }
        }
        const resp = useCache ? saasCtxCache.get(saasToken ?? '' + databaseIdHash) : null;
        if (!useCache) {
            console.log('Cache for SaasContext disabled');
        }
        if (resp) {
            return {
                ...resp,
                apiClient: new PlatformApiClient(saasToken ?? '')
            } as AuthorizedSaaSContext;
        } else {
            const client = new PlatformApiClient(saasToken ?? '');
            try {
                const response = await client.account({ databaseIdHash, apiKey: saasToken });
                if (response.status !== 200) {
                    const resp = {
                        saasContex: null,
                        isSaasMode: false,
                        hasAccess: false,
                        apiClient: null,
                        error: response.message
                    }
                    saasCtxCache.set(saasToken ?? '' + databaseIdHash, resp, 60 * 2); // errors cachef for 2s
                    return resp;

                } else {
                    const saasContext = await response.data;
                    const resp = {
                        saasContex: saasContext as SaaSDTO,
                        hasAccess: true,
                        isSaasMode: true,
                        apiClient: client
                    }
                    saasCtxCache.set(saasToken ?? '' + databaseIdHash, resp, 60 * 60 * 10); // ok results cached for 10 min
                    return resp;
                }
            } catch (e) {
                if (e instanceof ApiError && e.code && e.code === 'ECONNREFUSED') { // saas is down
                    return {
                        saasContex: null,
                        isSaasMode: false,
                        hasAccess: true,
                        apiClient: null
                    }
                } else {
                    return {
                        saasContex: null,
                        isSaasMode: false,
                        hasAccess: false,
                        apiClient: null,
                        error: getErrorMessage(e)
                    }
                }
            }
        }
    }
}

export async function decryptTemporaryKeys(timeBasedEncryptionKey: string, encryptedMasterKey: string, keyLocatorHash: string): Promise<{ masterKey: string | null, encryptionKey: string | null }> {
    let masterKey = null;
    let encryptionKey = null;
    if (timeBasedEncryptionKey) {
        const otp = otpManager.getOTP(keyLocatorHash);
        if (!otp) {
            console.log(`No OTP found for keyLocatorHash: ${keyLocatorHash}, cannot decrypt`);
            return { masterKey: null, encryptionKey: null };
        }

        const keyEncryptionTools = new EncryptionUtils(otp); // should be the same as the one used to encrypt the data
        encryptionKey = await keyEncryptionTools.decrypt(timeBasedEncryptionKey);

        const masterKeyEncryptionTools = new EncryptionUtils(encryptionKey);
        masterKey = await masterKeyEncryptionTools.decrypt(encryptedMasterKey);
    }

    return { masterKey, encryptionKey };
}


async function prepareAuthorizedRequestContext(authResult: KeyDTO, enclaveSecurity: { masterKey: string | null, ecnryptionKey: string | null, serverCommunicationKey: string } | null = null ): Promise<AuthorizedRequestContext> {

    let aclDTO: KeyACLDTO | null = null;
    try {
        const keyACL = (authResult as KeyDTO).acl ?? null;
        aclDTO = keyACL ? JSON.parse(keyACL) : defaultKeyACL
    } catch (e) {
        console.error('Error parsing Key ACL:', e);
        throw new AuthorizationError('Invalid Key ACL format');
    }
    return {
        databaseIdHash: authResult.databaseIdHash,
        keyHash: authResult.keyHash,
        keyLocatorHash: authResult.keyLocatorHash,
        acl: aclDTO as KeyACLDTO,
        extra: (authResult as KeyDTO).extra,
        masterKey: enclaveSecurity?.masterKey ? enclaveSecurity.masterKey : null, // if enclaveSecurity is provided, it is used as master key
        encryptionKey: enclaveSecurity?.ecnryptionKey ? enclaveSecurity.ecnryptionKey : null, // if enclaveSecurity is provided, it is used as encryption key
        serverCommunicationKey: enclaveSecurity?.serverCommunicationKey ? enclaveSecurity.serverCommunicationKey : null, // if enclaveSecurity is provided, it is used as server communication key
        deleteTemporaryServerKey: () => aclDTO?.role === KeyAuthorizationZone.Enclave ? deleteTemporaryServerKey({ keyLocatorHash: authResult.keyLocatorHash, keyHash: authResult.keyHash, databaseIdHash: authResult.databaseIdHash }) : new Promise((resolve) => resolve(false)) // only allow deletion of temporary keys
    }
}

export async function authorizeRequestContext(request: NextRequest, response?: NextResponse, authorizationZone: KeyAuthorizationZone = KeyAuthorizationZone.Standard): Promise<AuthorizedRequestContext> {
    // Try to get token from Authorization header first, then from query params
    const authorizationHeader = request.headers.get('Authorization');
    let jwtToken = authorizationHeader?.replace('Bearer ', '');

    try {
        if (authorizationZone === KeyAuthorizationZone.Enclave) { // security enclave - use temporary key for authorization

            let { databaseIdHash, keyHash, keyLocatorHash, timeBasedEncryptionKey } = getEnclaveRequestAuthorization(request);
            const authResult = await authorizeKey({
                databaseIdHash: databaseIdHash as string,
                keyHash: keyHash as string,
                keyLocatorHash: keyLocatorHash as string
            });

            if (!authResult) {
                NextResponse.json({ message: 'Unauthorized', status: 401 });
                throw new AuthorizationError('Unauthorized. Wrong Key.');
            } else {

                const { masterKey, encryptionKey } = timeBasedEncryptionKey ? await decryptTemporaryKeys(timeBasedEncryptionKey, (authResult as KeyDTO).encryptedMasterKey, (authResult as KeyDTO).keyLocatorHash) : { masterKey: null, encryptionKey: null };

                if (!masterKey || !encryptionKey) {
                    NextResponse.json({ message: 'Unauthorized. Temporary key decryption failed', status: 401 });
                    throw new AuthorizationError('Unauthorized. Temporary key decryption failed');
                }
                const keyHashParams = keyHashParamsDTOSchema.parse(JSON.parse((authResult as KeyDTO).keyHashParams))

                const isTemporaryEncryptionKeyVerified = await verify((authResult as KeyDTO).keyHash, encryptionKey);
                console.log('Key Hash Verification:', isTemporaryEncryptionKeyVerified);

                if (!isTemporaryEncryptionKeyVerified) {
                    NextResponse.json({ message: 'Unauthorized.', status: 401 });
                    throw new AuthorizationError('Unauthorized. Temporary encryption key is wrong.');
                }

                return prepareAuthorizedRequestContext(authResult as KeyDTO, {
                    masterKey: masterKey,
                    ecnryptionKey: encryptionKey,
                    serverCommunicationKey: timeBasedEncryptionKey // use server communication key if available
                }); // add temporary key if available
            }

        } else {

            if (!jwtToken) {
                jwtToken = request.nextUrl.searchParams.get('token') || undefined;
            }

            if (jwtToken) {
                const decoded = await jwtVerify(jwtToken as string, new TextEncoder().encode(process.env.NEXT_PUBLIC_TOKEN_SECRET || 'Jeipho7ahchue4ahhohsoo3jahmui6Ap'));

                const authResult = await authorizeKey({
                    databaseIdHash: decoded.payload.databaseIdHash as string,
                    keyHash: decoded.payload.keyHash as string,
                    keyLocatorHash: decoded.payload.keyLocatorHash as string
                });

                if (!authResult) {
                    NextResponse.json({ message: 'Unauthorized', status: 401 });
                    throw new AuthorizationError('Unauthorized. Wrong Key.');
                } else {
                    return prepareAuthorizedRequestContext(authResult as KeyDTO, null); // no temporary key in standard zone
                }
            } else {
                NextResponse.json({ message: 'Unauthorized', status: 401 });
                throw new AuthorizationError('Unauthorized. No Token');
            }
        }
    } catch (e) {
        console.error('Error authorizing request context:', getErrorMessage(e));
        NextResponse.json({ message: 'Unauthorized', status: 401 });

        throw new AuthorizationError(getErrorMessage(e));
    }
}

export async function genericPUT<T extends { [key: string]: any }>(inputObject: any, schema: { safeParse: (a0: any) => { success: true; data: T; } | { success: false; error: ZodError; } }, repo: BaseRepository<T>, identityKey: string): Promise<ApiResult> {
    try {
        const validationResult = schema.safeParse(inputObject); // validation
        if (validationResult.success === true) {
            const updatedValues: T = validationResult.data as T;
            const upsertedData = await repo.upsert({ [identityKey]: updatedValues[identityKey] }, updatedValues)

            return {
                message: 'Data saved successfully!',
                data: upsertedData,
                status: 200
            };
        } else {
            return {
                message: getZedErrorMessage(validationResult.error),
                issues: validationResult.error.issues,
                status: 400
            };
        }
    } catch (e) {
        console.error(e);
        return {
            message: getErrorMessage(e),
            error: e,
            status: 500
        };
    }
}

export async function genericGET<T extends { [key: string]: any }>(request: NextRequest, repo: BaseRepository<T>, defaultLimit: number = -1, defaultOffset: number = -1): Promise<T[]> {
    const filterObj: Record<string, string> = Object.fromEntries(request.nextUrl.searchParams.entries());

    let limit = defaultLimit;
    let offset = defaultOffset;
    if (filterObj.limit) {
        limit = parseInt(filterObj.limit);
    }
    if (filterObj.offset) {
        offset = parseInt(filterObj.offset);
    }
    const items: T[] = await repo.findAll({ filter: filterObj, limit, offset });
    return items;
}


export async function genericDELETE<T extends { [key: string]: any }>(request: NextRequest, repo: BaseRepository<T>, query: Record<string, string | number>): Promise<ApiResult> {
    try {
        if (await repo.delete(query)) {
            return {
                message: 'Data deleted successfully!',
                status: 200
            }
        } else {
            return {
                message: 'Data not found!',
                status: 400
            }
        }
    } catch (e) {
        console.error(e);
        return {
            message: getErrorMessage(e),
            error: e,
            status: 500
        }
    }
}
import { BaseRepository } from "@/data/server/base-repository";
import { getErrorMessage, getZedErrorMessage } from "./utils";
import { ZodError, ZodObject } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { authorizeKey } from "@/data/server/server-key-helpers";
import { jwtVerify } from "jose";
import { defaultKeyACL, KeyACLDTO, KeyDTO, SaaSDTO } from "@/data/dto";
import { Key } from "react";
import { PlatformApiClient } from "@/data/server/platform-api-client";
import NodeCache from "node-cache";
import { ApiError } from "@/data/client/base-api-client";
import { DTOEncryptionFilter, EncryptionUtils } from "@/lib/crypto";
import { otpManager } from "./otp-manager";

const saasCtxCache = new NodeCache({ stdTTL: 60 * 60 * 10 /* 10 min cache */});

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
}

export type AuthorizedSaaSContext = {
    saasContex: SaaSDTO|null
    isSaasMode: boolean
    hasAccess: boolean;
    error?: string;
    apiClient: PlatformApiClient|null
}

export async function authorizeSaasContext(request: NextRequest, forceNoCache: boolean = false): Promise<AuthorizedSaaSContext> {
    if(!process.env.SAAS_PLATFORM_URL) {
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
                if(response.status !== 200) {
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

export async function getTemporaryPassedMasterKeyFromRequest(request: NextRequest, encryptedMasterKey: string, keyLocatorHash: string): Promise<{masterKey: string | null, encryptionKey: string | null}> {
    let timeBasedEncryptionKey = request.headers.get('encryption-key') !== null ? request.headers.get('encryption-key') : request.nextUrl.searchParams.get('encr') !== null ? request.nextUrl.searchParams.get('encr') : null;

    let masterKey = null;
    let encryptionKey = null;
    if (timeBasedEncryptionKey) {
        const otp = otpManager.getOTP(keyLocatorHash);
        if (!otp) {
            console.log(`No OTP found for keyLocatorHash: ${keyLocatorHash}, cannot decrypt`);
            return { masterKey: null, encryptionKey: null };
        }
        
        console.log('OTP: ', otp);
        const keyEncryptionTools = new EncryptionUtils(otp); // should be the same as the one used to encrypt the data
        encryptionKey = await keyEncryptionTools.decrypt(timeBasedEncryptionKey);
        console.log('Encryption Key: ', encryptionKey);

        const masterKeyEncryptionTools = new EncryptionUtils(encryptionKey);
        masterKey = await masterKeyEncryptionTools.decrypt(encryptedMasterKey);
    }

    return {masterKey, encryptionKey};
}

export async function authorizeRequestContext(request: NextRequest, response?: NextResponse): Promise<AuthorizedRequestContext> {
    // Try to get token from Authorization header first, then from query params
    const authorizationHeader = request.headers.get('Authorization');
    let jwtToken = authorizationHeader?.replace('Bearer ', '');
    
    // If not found in header, try query params
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
        if(!authResult) {
            NextResponse.json({ message: 'Unauthorized', status: 401 });
            throw new Error('Unauthorized. Wrong Key.');
        } else {
            // Generate and store OTP for this user session
            const keyLocatorHash = decoded.payload.keyLocatorHash as string;
            otpManager.generateAndStoreOTP(keyLocatorHash);

            const {masterKey, encryptionKey} = await getTemporaryPassedMasterKeyFromRequest(request, (authResult as KeyDTO).encryptedMasterKey, keyLocatorHash);

            const keyACL = (authResult as KeyDTO).acl ?? null;
            const aclDTO = keyACL ? JSON.parse(keyACL) : defaultKeyACL
            return {
                databaseIdHash: decoded.payload.databaseIdHash as string,
                keyHash: decoded.payload.keyHash as string,
                keyLocatorHash: decoded.payload.keyLocatorHash as string,
                acl: aclDTO as KeyACLDTO,
                extra: (authResult as KeyDTO).extra,
                masterKey: masterKey,
                encryptionKey: encryptionKey,
                serverCommunicationKey: decoded.payload.serverCommunicationKey as string // OTP key generated by the server
            }
        }
    } else {
        throw new Error('Unauthorized. No Token');
    }
}

export async function genericPUT<T extends { [key:string]: any }>(inputObject: any, schema: { safeParse: (a0:any) => { success: true; data: T; } | { success: false; error: ZodError; } }, repo: BaseRepository<T>, identityKey: string): Promise<ApiResult> {
    try {
        const validationResult = schema.safeParse(inputObject); // validation
        if (validationResult.success === true) {
            const updatedValues:T = validationResult.data as T;
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

export async function genericGET<T extends { [key:string]: any }>(request: NextRequest, repo: BaseRepository<T>, defaultLimit: number = -1, defaultOffset: number  = -1): Promise<T[]> {
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


export async function genericDELETE<T extends { [key:string]: any }>(request: NextRequest, repo: BaseRepository<T>, query: Record<string, string | number>): Promise<ApiResult>{
    try {
        if(await repo.delete(query)) {
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
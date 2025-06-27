import { databaseAuthorizeRequestSchema, defaultKeyACL, KeyAuthorizationZone, KeyDTO } from "@/data/dto";
import { authorizeKey, checkKeyACL } from "@/data/server/server-key-helpers";
import { authorizeSaasContext } from "@/lib/generic-api";
import { generateTimeBasedPassword } from "@/lib/totp";
import { getErrorMessage, getZedErrorMessage } from "@/lib/utils";
import {SignJWT, jwtVerify, type JWTPayload} from 'jose'
import { NextRequest } from "next/server";
import { otpManager } from "@/lib/otp-manager";

// clear all the database
export async function POST(request: NextRequest) {
    try {
        const jsonRequest = await request.json();
        const validationResult = databaseAuthorizeRequestSchema.safeParse(jsonRequest); // validation

        const saasContext = await authorizeSaasContext(request, true); // authorize SaaS context
        if (!saasContext.hasAccess) {
            return Response.json({
                message: saasContext.error,
                status: 401
            });
        }

        if (validationResult.success === true) {
            const authRequest = validationResult.data;
            const keyDetails = await authorizeKey(authRequest);

            if (!keyDetails) { // this situation theoretically should not happen bc. if database file exists we return out of the function
                return Response.json({
                    message: 'Invalid Database Id or Key. Key not found.',
                    status: 401               
                });                    
            } else {

                const preventEnclaveKeysToAuthorizeApp = await checkKeyACL(keyDetails as KeyDTO, KeyAuthorizationZone.Enclave);

                if (preventEnclaveKeysToAuthorizeApp) {
                    return Response.json({
                        message: 'Enclave keys are not allowed to authorize the app.',
                        status: 403               
                    });  
                }                

                const alg = 'HS256'
                const tokenPayload = { databaseIdHash: authRequest.databaseIdHash, keyHash: authRequest.keyHash, keyLocatorHash: authRequest.keyLocatorHash }
                const accessToken = await new SignJWT(tokenPayload)
                .setProtectedHeader({ alg })
                .setIssuedAt()
                .setIssuer('urn:ctt:doctor-dok')
                .setAudience('urn:ctt:doctor-dok')
                .setExpirationTime('15m')
                .sign(new TextEncoder().encode(process.env.NEXT_PUBLIC_TOKEN_SECRET || 'Jeipho7ahchue4ahhohsoo3jahmui6Ap'))

                const refreshToken = await new SignJWT(tokenPayload)
                .setProtectedHeader({ alg })
                .setIssuedAt()
                .setIssuer('urn:ctt:doctor-dok')
                .setAudience('urn:ctt:doctor-dok')
                .setExpirationTime('8h')
                .sign(new TextEncoder().encode(process.env.NEXT_PUBLIC_REFRESH_TOKEN_SECRET || 'Am2haivu9teiseejai5Ao6engae8hiuw'))

                const keyACL = (keyDetails as KeyDTO).acl ?? null;
                return Response.json({
                    message: 'Succesfully Authorized!',
                    data: {
                        encryptedMasterKey: (keyDetails as KeyDTO).encryptedMasterKey,
                        accessToken:  accessToken,
                        refreshToken: refreshToken,
                        acl: keyACL ? JSON.parse(keyACL) : defaultKeyACL,
                        serverCommunicationKey: otpManager.generateAndStoreOTP(authRequest.keyLocatorHash),
                        saasContext: saasContext ? saasContext.saasContex : null
                    },
                    status: 200
                });                    
            }         
        } else {
            console.error(validationResult);
            return Response.json({
                message: getZedErrorMessage(validationResult.error),
                issues: validationResult.error.issues,
                status: 400               
            });
        }
    } catch (e) {
        console.error(e);
        return Response.json({
            message: getErrorMessage(e),
            error: e,
            status: 500
        });
    }    
}

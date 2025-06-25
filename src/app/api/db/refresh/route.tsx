import { DatabaseAuthorizeRequestDTO, databaseRefreshRequestSchema, KeyDTO } from "@/data/dto";
import { authorizeKey } from "@/data/server/server-key-helpers";
import { generateTimeBasedPassword } from "@/lib/totp";
import { getErrorMessage, getZedErrorMessage } from "@/lib/utils";
import {SignJWT, jwtVerify, type JWTPayload} from 'jose'
import { NextRequest } from "next/server";
import { otpManager } from "@/lib/otp-manager";

// clear all the database
export async function POST(request: NextRequest) {
    try {
        const jsonRequest = await request.json();
        const validationResult = databaseRefreshRequestSchema.safeParse(jsonRequest); // validation
        if (validationResult.success === true) {

            const jwtToken = validationResult.data.refreshToken;
            const tokenData = await jwtVerify<DatabaseAuthorizeRequestDTO>(jwtToken, new TextEncoder().encode(process.env.NEXT_PUBLIC_REFRESH_TOKEN_SECRET || 'Am2haivu9teiseejai5Ao6engae8hiuw'))
            const authRequest = {
                databaseIdHash: tokenData.payload.databaseIdHash,
                keyHash: tokenData.payload.keyHash,
                keyLocatorHash: tokenData.payload.keyLocatorHash                
            };
            const keyDetails = await authorizeKey(authRequest);

            if (!keyDetails) { // this situation theoretically should not happen bc. if database file exists we return out of the function
                return Response.json({
                    message: 'Invalid Database Id or Key. Key not found.',
                    status: 401               
                });                    
            } else {

                const alg = 'HS256'
                const serverCommunicationKey = otpManager.generateAndStoreOTP(authRequest.keyLocatorHash);
                const tokenPayload = { databaseIdHash: authRequest.databaseIdHash, keyHash: authRequest.keyHash, keyLocatorHash: authRequest.keyLocatorHash, serverCommunicationKey }
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

                return Response.json({
                    message: 'Succesfully Refreshed!',
                    data: {
                        accessToken:  accessToken,
                        refreshToken: refreshToken,
                        serverCommunicationKey: serverCommunicationKey
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

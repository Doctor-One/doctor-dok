import { NextRequest } from "next/server";
import { getErrorMessage } from "./utils";
import { AuthorizationUrlZones } from "@/data/dto";

export function getEnclaveRequestAuthorization(request: NextRequest) {
    try {
        if (request.nextUrl.pathname.startsWith(AuthorizationUrlZones.Enclave) === false) {
            throw new Error('Request is not for enclave authorization zone');
        }

        let keyLocatorHash = request.headers.get('key-locator-hash') !== null ? request.headers.get('key-locator-hash') : request.nextUrl.searchParams.get('klh'); // we let the user to override the key data from the JWT token to allow for server-side decryption
        let keyHash = request.headers.get('key-hash') !== null ? request.headers.get('key-hash') : request.nextUrl.searchParams.get('kh');
        let databaseIdHash = request.headers.get('database-id-hash') !== null ? request.headers.get('database-id-hash') : request.nextUrl.searchParams.get('dbid');
        let timeBasedEncryptionKey = request.headers.get('encryption-key') !== null ? request.headers.get('encryption-key') : request.nextUrl.searchParams.get('encr') !== null ? request.nextUrl.searchParams.get('encr') : null;


        if (!keyLocatorHash || !keyHash || !databaseIdHash || !timeBasedEncryptionKey) {
            throw new Error('Missing required parameters: keyLocatorHash, keyHash, or databaseIdHash, timeBasedEncryptionKey');
        }

        return { databaseIdHash, keyHash, keyLocatorHash, timeBasedEncryptionKey };
    } catch (e) {
        console.error('Error parsing enclave request authorization:', getErrorMessage(e));
        throw new Error('Invalid enclave request authorization format: ' + getErrorMessage(e));    
    }
}
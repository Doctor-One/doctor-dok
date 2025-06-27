import { DatabaseAuthorizeRequestDTO, DeleteKeyRequestDTO, KeyACLDTO, KeyAuthorizationZone, KeyDTO } from "../dto";
import ServerKeyRepository from "./server-key-repository";


export async function authorizeKey(authRequest: DatabaseAuthorizeRequestDTO, zone: KeyAuthorizationZone = KeyAuthorizationZone.Standard): Promise<KeyDTO | boolean> {
    
    if (Object.values(KeyAuthorizationZone).includes(zone as KeyAuthorizationZone) === false) {
        return false; // invalid zone
    }

    
    const keyRepo = new ServerKeyRepository(authRequest.databaseIdHash, '', zone); // get the user key
    const existingKeys:KeyDTO[] = await keyRepo.findAll({  filter: { keyLocatorHash: authRequest.keyLocatorHash } }); // check if key already exists
    
    if(existingKeys.length === 0) { // this situation theoretically should not happen bc. if database file exists we return out of the function
        return false;      
    } else {
        const isExpired = existingKeys[0].expiryDate ? (new Date(existingKeys[0].expiryDate)).getTime() < Date.now() : false;
        if (existingKeys[0].keyHash !== authRequest.keyHash || isExpired) {    
            return false;
        } else {
            return existingKeys[0];
        }
    }
}

export async function checkKeyACL(key: KeyDTO, requiredRole: string): Promise<boolean> {
    const keyACL = key.acl ? JSON.parse(key.acl) as KeyACLDTO : null;
    if (!keyACL) {
        console.error('Key ACL is not defined');
        return false;
    } 

    if (keyACL.role === requiredRole) {
        return true;
    } else {
        return false;
    }
}

export async function deleteTemporaryServerKey(deleteKeyReqeuest: DeleteKeyRequestDTO): Promise<boolean> {
    const keyRepo = new ServerKeyRepository(deleteKeyReqeuest.databaseIdHash, '' , KeyAuthorizationZone.Enclave); // we can delete keys only from the enclave
    const existingKeys:KeyDTO[] = await keyRepo.findAll({  filter: { keyLocatorHash: deleteKeyReqeuest.keyLocatorHash } }); // check if key already exists
    if(existingKeys.length !== 1) { // this situation theoretically should not happen bc. if database file exists we return out of the function
        return false;      
    } else {
        
    if (existingKeys[0].keyHash !== deleteKeyReqeuest.keyHash || !existingKeys[0].expiryDate || !checkKeyACL(existingKeys[0], KeyAuthorizationZone.Enclave) || existingKeys[0].zone !== KeyAuthorizationZone.Enclave ) {     // double check if the key is the same as the one we're trying to delete - it must be temporary
            console.error('Key is not the same as the one we\'re trying to delete - it must be temporary');
            return false;
        } else {
            return keyRepo.delete({ keyLocatorHash: existingKeys[0].keyLocatorHash });
        }
    }
}
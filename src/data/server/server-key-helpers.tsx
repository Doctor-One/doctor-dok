import { DatabaseAuthorizeRequestDTO, DeleteKeyRequestDTO, KeyACLDTO, KeyDTO } from "../dto";
import ServerKeyRepository from "./server-key-repository";


export async function authorizeKey(authRequest: DatabaseAuthorizeRequestDTO): Promise<KeyDTO | boolean> {
    const keyRepo = new ServerKeyRepository(authRequest.databaseIdHash); // get the user key
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

export async function deleteTemporaryServerKey(deleteKeyReqeuest: DeleteKeyRequestDTO): Promise<boolean> {
    const keyRepo = new ServerKeyRepository(deleteKeyReqeuest.databaseIdHash); // get the user key
    const existingKeys:KeyDTO[] = await keyRepo.findAll({  filter: { keyLocatorHash: deleteKeyReqeuest.keyLocatorHash } }); // check if key already exists
    if(existingKeys.length !== 1) { // this situation theoretically should not happen bc. if database file exists we return out of the function
        return false;      
    } else {
        const keyACL = existingKeys[0].acl ? JSON.parse(existingKeys[0].acl) as KeyACLDTO : null;
        if (existingKeys[0].keyHash !== deleteKeyReqeuest.keyHash || !existingKeys[0].expiryDate || keyACL?.role !== 'temp') {     // double check if the key is the same as the one we're trying to delete - it must be temporary
            console.error('Key is not the same as the one we\'re trying to delete - it must be temporary');
            console.error(existingKeys[0]);
            return false;
        } else {
            return keyRepo.delete({ keyLocatorHash: existingKeys[0].keyLocatorHash });
        }
    }
}
import { DatabaseAuthorizeRequestDTO, DeleteKeyRequestDTO, KeyDTO } from "../dto";
import ServerKeyRepository from "./server-key-repository";

export async function authorizeKey(authRequest: DatabaseAuthorizeRequestDTO): Promise<KeyDTO | boolean> {
    const keyRepo = new ServerKeyRepository(authRequest.databaseIdHash); // get the user key
    const existingKeys:KeyDTO[] = await keyRepo.findAll({  filter: { keyLocatorHash: authRequest.keyLocatorHash } }); // check if key already exists
    console.log('auth', existingKeys);
    console.log('authRequest', authRequest);
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
    console.log(existingKeys);
    if(existingKeys.length !== 1) { // this situation theoretically should not happen bc. if database file exists we return out of the function
        return false;      
    } else {
        if (existingKeys[0].keyHash !== deleteKeyReqeuest.keyHash || !existingKeys[0].expiryDate) {     // double check if the key is the same as the one we're trying to delete - it must be temporary
            console.error('Key is not the same as the one we\'re trying to delete - it must be temporary');
            console.error(existingKeys[0]);
            return false;
        } else {
            console.log('deleting temporary server key', existingKeys[0].keyLocatorHash);
            return keyRepo.delete({ keyLocatorHash: existingKeys[0].keyLocatorHash });
        }
    }
}
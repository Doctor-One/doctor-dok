import { EncryptionUtils, generateEncryptionKey, sha256 } from '@/lib/crypto';
import { Key } from '@/data/client/models';
import { DatabaseContextType, defaultDatabaseIdHashSalt, defaultKeyLocatorHashSalt } from '@/contexts/db-context';
import { KeyACLDTO, KeyDTO } from '@/data/dto';
import { KeyApiClient, PutKeyResponse, PutKeyResponseError } from '@/data/client/key-api-client';
import { SaaSContextType } from '@/contexts/saas-context';
import { getCurrentTS } from '@/lib/utils';
import assert from 'assert';
const argon2 = require("argon2-browser");


// Helper function to encrypt the key for server communication
export async function temporaryServerEncryptionKey(
    dbContext: DatabaseContextType,
    saasContext: SaaSContextType | null
  ): Promise<KeyDTO & {
    encryptedKey: string;
  }> {
  
    try {
      const sharedKey = generateEncryptionKey();
      const generatedKey = await addKeyHelper(dbContext.databaseId, 'Temporary Key for Server Communication', sharedKey, new Date(Date.now() + 5 * 3600 * 1000), { role: 'guest', features: ['*'] }, dbContext, saasContext) as PutKeyResponseSuccess;
  
      const keyEncryptionTools = new EncryptionUtils(dbContext.serverCommunicationKey);
      const encryptedKey = await keyEncryptionTools.encrypt(sharedKey);
      
      return {
        ...generatedKey.data,
        encryptedKey: encryptedKey
      }
  
    } catch (error) {
      console.error(error);
      throw new Error('Failed to generate temporary key for server communication');
    }
  }

// Standalone function that can be called without React dependencies
export const addKeyHelper = async (
    databaseId: string, 
    displayName: string, 
    sharedKey: string, 
    expDate: Date | null, 
    acl: KeyACLDTO,
    dbContext: DatabaseContextType,
    saasContext: SaaSContextType | null,
    existingKeys: Key[] = [],
    onSuccess?: () => void,
    onError?: (message: string) => void
): Promise<PutKeyResponse> => {
    const keyHashParams = {
        salt: generateEncryptionKey(),
        time: 2,
        mem: 16 * 1024,
        hashLen: 32,
        parallelism: 1
    } 
    const keyHash = await argon2.hash({
      pass: sharedKey,
      salt: keyHashParams.salt,
      time: keyHashParams.time,
      mem: keyHashParams.mem,
      hashLen: keyHashParams.hashLen,
      parallelism: keyHashParams.parallelism
    });
    const databaseIdHash = await sha256(databaseId, defaultDatabaseIdHashSalt);
    const keyLocatorHash = await sha256(sharedKey + databaseId, defaultKeyLocatorHashSalt);

    const existingKey = existingKeys.find((key) => key.keyLocatorHash === keyLocatorHash);
    if (existingKey) {
        const errorMessage = 'Key already exists, please choose a different key!';
        if (onError) {
            onError(errorMessage);
        }
        throw new Error('Key already exists');
    }

    const encryptionUtils = new EncryptionUtils(sharedKey);
    const masterKey = await dbContext.masterKey;
    assert(masterKey, 'Master key is not set');
    const encryptedMasterKey = await encryptionUtils.encrypt(masterKey);
    
    const apiClient = new KeyApiClient('', dbContext, saasContext);
    const keyDTO: KeyDTO = {
        databaseIdHash,
        encryptedMasterKey,
        keyHash: keyHash.encoded,
        keyHashParams: JSON.stringify(keyHashParams),
        keyLocatorHash,
        displayName,
        acl: JSON.stringify(acl),
        expiryDate: expDate !== null ? expDate.toISOString() : '',
        updatedAt: getCurrentTS()
    };

    const result = await apiClient.put(keyDTO);
    
    if(result.status === 200) {
        if (onSuccess) {
            onSuccess();
        }
    } else {
        const errorMessage = (result as PutKeyResponseError).message;
        if (onError) {
            onError(errorMessage);
        }
    }

    return result;
}; 
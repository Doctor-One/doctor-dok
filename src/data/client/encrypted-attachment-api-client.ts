import { DatabaseContextType } from "@/contexts/db-context";
import { SaaSContextType } from "@/contexts/saas-context";
import { EncryptedAttachmentDTO, KeyDTO } from "../dto";
import { ApiClient, ApiEncryptionConfig } from "./base-api-client";

export type PutEncryptedAttachmentRequest = FormData | EncryptedAttachmentDTO;

export type PutEncryptedAttachmentResponseSuccess = {
  message: string;
  data: EncryptedAttachmentDTO;
  status: 200;
};

export type DeleteEncryptedAttachmentResponse = {
  message: string;
  status: 200;
};

export type PutEncryptedAttachmentResponseError = {
  message: string;
  status: 400;
  issues?: any[];
};

export type PutEncryptedAttachmentResponse = PutEncryptedAttachmentResponseSuccess | PutEncryptedAttachmentResponseError;

export class EncryptedAttachmentApiClient extends ApiClient {
    constructor(baseUrl: string, dbContext?: DatabaseContextType | null, saasContext?: SaaSContextType | null, encryptionConfig?: ApiEncryptionConfig) {
      super(baseUrl, dbContext, saasContext, encryptionConfig);
    }

  
    async put(inputObject:PutEncryptedAttachmentRequest): Promise<PutEncryptedAttachmentResponse> {
      if (inputObject instanceof FormData) {
        return this.request<PutEncryptedAttachmentResponse>('/api/encrypted-attachment', 'PUT', { ecnryptedFields: [] }, null, inputObject as FormData) as Promise<PutEncryptedAttachmentResponse>;
      } else {
        return this.request<PutEncryptedAttachmentResponse>('/api/encrypted-attachment', 'PUT', { ecnryptedFields: ['displayName'] }, inputObject as EncryptedAttachmentDTO) as Promise<PutEncryptedAttachmentResponse>;
      }
    }

    async get(attachment: EncryptedAttachmentDTO): Promise<ArrayBuffer | undefined | null> {
      return this.getArrayBuffer('/api/encrypted-attachment/' + attachment.storageKey, undefined);
    }

    async getDecryptedServerSide(attachment: EncryptedAttachmentDTO, temporaryServerKey: KeyDTO & { encryptedKey: string }): Promise<ArrayBuffer | undefined | null> { // unsafe - as it passes the encryption key to the server
      return this.getArrayBuffer('/api/encrypted-attachment/' + attachment.storageKey, undefined, temporaryServerKey);
    }


    async delete(attachment: EncryptedAttachmentDTO): Promise<DeleteEncryptedAttachmentResponse> {
      return this.request<DeleteEncryptedAttachmentResponse>('/api/encrypted-attachment/' + attachment.storageKey, 'DELETE', { ecnryptedFields: [] }) as Promise<DeleteEncryptedAttachmentResponse>;
    }
    
  }
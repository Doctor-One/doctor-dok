import { DTOEncryptionFilter, EncryptionUtils, generateEncryptionKey } from "@/lib/crypto";
import { DTOEncryptionSettings, KeyDTO } from "../dto";
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { DatabaseContextType } from "@/contexts/db-context";
import { SaaSContextType } from "@/contexts/saas-context";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { ApiError } from "@/data/dto";
import { PutKeyResponseSuccess } from "./key-api-client";

export type ApiEncryptionConfig = {
  secretKey?: string;
  useEncryption: boolean;
};



export class ApiClient {
  private baseUrl: string;
  private encryptionFilter: DTOEncryptionFilter<any> | null = null;
  private encryptionConfig?: ApiEncryptionConfig | null = null;
  private encryptionUtils: EncryptionUtils | null = null;
  private dbContext?: DatabaseContextType | null = null;
  private saasContext?: SaaSContextType | null = null;
  private saasToken: string | null = null;

  constructor(baseUrl: string, databaseContext?: DatabaseContextType | null, saasContext?: SaaSContextType | null, encryptionConfig?: ApiEncryptionConfig) {
    this.baseUrl = baseUrl;
    this.dbContext = databaseContext;
    this.saasContext = saasContext;
    if (this.saasContext) this.setSaasToken(this.saasContext.saasToken ?? '');
    if (encryptionConfig?.useEncryption) {
      this.encryptionFilter = new DTOEncryptionFilter(encryptionConfig.secretKey as string);
    }
    this.encryptionUtils = new EncryptionUtils(encryptionConfig?.secretKey as string);
    this.encryptionConfig = encryptionConfig;
  }

  public setSaasToken(token: string) {
    this.saasToken = token;
  }

  public async getArrayBuffer(
    endpoint: string,
    repeatedRequestAccessToken = '',
    temporaryKey: KeyDTO & { encryptedKey: string } | null = null
  ): Promise<ArrayBuffer | null | undefined> {
    const headers: Record<string, string> = {};

    if (this.dbContext?.accessToken || repeatedRequestAccessToken) {
      headers['Authorization'] = `Bearer ${repeatedRequestAccessToken ? repeatedRequestAccessToken : this.dbContext?.accessToken}`;
    }

    if(this.dbContext && temporaryKey) {
      headers['Encryption-Key'] = temporaryKey.encryptedKey;
      headers['Key-Locator-Hash'] = temporaryKey.keyLocatorHash;
      headers['Key-Hash'] = temporaryKey.keyHash;
    }

    if(this.dbContext?.databaseHashId) {
      headers['Database-Id-Hash'] = this.dbContext?.databaseHashId;
    }

    if(this.saasToken) {
      headers['SaaS-Token'] = this.saasToken;
    }

    const config: AxiosRequestConfig = {
      method: 'GET',
      url: `${this.baseUrl}${endpoint}`,
      headers,
      responseType: 'blob',
      validateStatus: (status) => status < 500,
    };

    try {
      const response: AxiosResponse<ArrayBuffer> = await axios(config);

      if(response.status === 401) {
        console.error('Unauthorized, first and only refresh attempt');
        // Refresh token
        if (!repeatedRequestAccessToken) {
          const refreshResult = await this.dbContext?.refresh({
            refreshToken: this.dbContext.refreshToken
          })
          if((refreshResult)?.success) {
            console.log('Refresh token success', this.dbContext?.accessToken);
            return this.getArrayBuffer(endpoint, refreshResult.accessToken, temporaryKey);
          } else {
            this.dbContext?.logout();
            toast.error('Refresh token failed. Please try to log-in again.');
            throw new Error('Request failed. Refresh token failed. Try log-in again.');
          }
        } else {
          this.dbContext?.logout();
          toast.error('Refresh token failed. Please try to log-in again.');
          throw new Error('Request failed. Refresh token failed. Try log-in again.');
        }
      }

      // if (response.status >= 400) {
      //   throw new Error(response.statusText || 'Request failed');
      // } we're processing HTTP response errors in the calling party
      return (this.encryptionConfig?.useEncryption) ? this.encryptionUtils?.decryptArrayBuffer(response.data) : response.data;
      
    } catch (error) {
      throw new Error('Request failed');
    }
  }

  public async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    encryptionSettings?: DTOEncryptionSettings,
    body?: any,
    formData?: FormData,
    repeatedRequestAccessToken:string = ''
  ): Promise<T | T[]> {
    const headers: Record<string, string> = {};

    if (this.dbContext?.accessToken || repeatedRequestAccessToken) {
      headers['Authorization'] = `Bearer ${repeatedRequestAccessToken ? repeatedRequestAccessToken : this.dbContext?.accessToken}`;
    }

    if(this.dbContext?.databaseHashId) {
      headers['Database-Id-Hash'] = this.dbContext?.databaseHashId;
    }

    if(this.dbContext && encryptionSettings?.temporaryServerKey) {
      headers['Encryption-Key'] = encryptionSettings.temporaryServerKey.encryptedKey;
      headers['Key-Locator-Hash'] = encryptionSettings.temporaryServerKey.keyLocatorHash;
      headers['Key-Hash'] = encryptionSettings.temporaryServerKey.keyHash;
    }

    if(this.saasToken) {
      headers['SaaS-Token'] = this.saasToken;
    }

    if (!repeatedRequestAccessToken) { //  if this is just a repeated request - in case of token refresh we're not encrypting data second time
      if (formData) {
          if (this.encryptionFilter) {
            throw new Error('Encryption is not supported for FormData');
          }

          // Set Content-Type header to 'multipart/form-data'
          headers['Content-Type'] = 'multipart/form-data';
        } else {
          // Set Content-Type header to 'application/json'
          headers['Content-Type'] = 'application/json';

          // Encrypt body if encryptionFilter is available
          if (body && this.encryptionFilter) {
            body = await this.encryptionFilter.encrypt(body, encryptionSettings);
          }
        }
    } else [
      console.log('Repeated request to ' + endpoint + ', skipping encryption')
    ]
    const config: AxiosRequestConfig = {
      method,
      url: `${this.baseUrl}${endpoint}`,
      headers,
      data: formData ? formData : body ? JSON.stringify(body) : undefined,
      validateStatus: (status) => status < 500,
    };

    try {
      const response: AxiosResponse = await axios(config);

      if(response.status === 401) {
        console.error('Unauthorized, first and only refresh attempt');
        // Refresh token
        if (!repeatedRequestAccessToken) {
          const refreshResult = await this.dbContext?.refresh({
            refreshToken: this.dbContext.refreshToken
          })
          if((refreshResult)?.success) {
            console.log('Refresh token success', this.dbContext?.accessToken);
            return this.request(endpoint, method, encryptionSettings, body, formData, refreshResult.accessToken);
          } else {
            this.dbContext?.logout();
            toast.error('Refresh token failed. Please try to log-in again.');
            throw new ApiError('Request failed. Refresh token failed. Try log-in again.', 401, refreshResult);
          }
        } else {
          this.dbContext?.logout();
          toast.error('Refresh token failed. Please try to log-in again.');
          throw new ApiError('Request failed. Refresh token failed. Try log-in again.', 401, null);
        }
      }

/*      if (response.status >= 400) {
        const errorData = response.data;
        throw new Error(errorData.message || 'Request failed');
      }*/ // commented out bc. we're processing response statuses in the calling party

      const responseData = response.data;

      if (this.encryptionFilter) {
        if (responseData instanceof Array) {
          const decryptedData = await Promise.all(responseData.map(async (data) => await this.encryptionFilter!.decrypt(data, encryptionSettings)));
          return decryptedData as T[];
        } else {
          const decryptedData = await this.encryptionFilter!.decrypt(responseData, encryptionSettings);
          return decryptedData as T;
        }
      } else {
        return responseData;
      }
    } catch (error) {
      console.log(error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = error instanceof Error && 'code' in error ? (error as any).code : 'UNKNOWN';
      throw new ApiError('Request failed' + getErrorMessage(error) + ' [' + errorCode + ']', errorCode, error);
    }
  }
}
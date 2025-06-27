import { DatabaseContextType } from "@/contexts/db-context";
import { OperationDTO } from "../dto";
import { ApiClient, ApiEncryptionConfig } from "./base-api-client";
import { SaaSContextType } from "@/contexts/saas-context";

export type OperationResponseSuccess = {
  message: string;
  data: OperationDTO | OperationDTO[];
  status: 200;
};

export type OperationResponseError = {
  message: string;
  status: 400 | 404;
  issues?: any[];
};

export type OperationResponse = OperationResponseSuccess | OperationResponseError;

export class OperationsApiClient extends ApiClient {
  constructor(baseUrl: string, dbContext?: DatabaseContextType | null, saasContext?: SaaSContextType | null, encryptionConfig?: ApiEncryptionConfig) {
    super(baseUrl, dbContext, saasContext, encryptionConfig);
  }

  async get(params: { id?: number; operationName?: string; recordId?: number; recordIds?: number[]; operationId?: string }): Promise<OperationResponse> {
    const search = new URLSearchParams();
    if (params.id !== undefined) search.append('id', String(params.id));
    if (params.recordId !== undefined) search.append('recordId', String(params.recordId));
    if (params.recordIds !== undefined) search.append('recordIds', params.recordIds.join(','));
    if (params.operationId !== undefined) search.append('operationId', params.operationId);
    if (params.operationName !== undefined) search.append('operationName', params.operationName);
    return this.request<OperationResponse>(`/api/operations?${search.toString()}`, 'GET', { ecnryptedFields: [] }) as Promise<OperationResponse>;
  }

  async create(operation: OperationDTO): Promise<OperationResponse> {
    return this.request<OperationResponse>('/api/operations', 'POST', { ecnryptedFields: [] }, operation) as Promise<OperationResponse>;
  }

  async update(operation: OperationDTO): Promise<OperationResponse> {
    return this.request<OperationResponse>('/api/operations', 'PUT', { ecnryptedFields: [] }, operation) as Promise<OperationResponse>;
  }

  async delete(params: { id?: number; recordId?: number; operationId?: string }): Promise<OperationResponse> {
    const search = new URLSearchParams();
    if (params.id !== undefined) search.append('id', String(params.id));
    if (params.recordId !== undefined) search.append('recordId', String(params.recordId));
    if (params.operationId !== undefined) search.append('operationId', params.operationId);
    return this.request<OperationResponse>(`/api/operations?${search.toString()}`, 'DELETE', { ecnryptedFields: [] }) as Promise<OperationResponse>;
  }
} 
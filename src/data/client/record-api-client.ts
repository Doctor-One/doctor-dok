import { ApiClient, ApiEncryptionConfig } from "./base-api-client";
import { SaaSContextType } from "@/contexts/saas-context";
import { FolderDTO, RecordDTO, RecordDTOEncSettings } from "../dto";
import { DatabaseContextType } from "@/contexts/db-context";

export type GetRecordsResponse = RecordDTO[];
export type PutRecordRequest = RecordDTO;

export type PutRecordResponseSuccess = {
  message: string;
  data: RecordDTO;
  status: 200;
};

export type DeleteRecordResponse = {
  message: string;
  status: 200;
};

export type GetLastUpdateDateResponseSuccess = {
  message: string;
  data: { 
    lastUpdateDate: string | null;
    recordId: number | null;
  };
  status: 200;
};

export type GetLastUpdateDateResponseError = {
  message: string;
  status: 400 | 500;
};

export type GetLastUpdateDateResponse = GetLastUpdateDateResponseSuccess | GetLastUpdateDateResponseError;

export type PutRecordResponseError = {
  message: string;
  status: 400;
  issues?: any[];
};

export type PutRecordResponse = PutRecordResponseSuccess | PutRecordResponseError;

export class RecordApiClient extends ApiClient {
    constructor(baseUrl: string, dbContext?: DatabaseContextType | null, saasContext?: SaaSContextType | null, encryptionConfig?: ApiEncryptionConfig) {
      super(baseUrl, dbContext, saasContext, encryptionConfig);
    }
  
    async get(folder: FolderDTO): Promise<GetRecordsResponse> {
      return this.request<GetRecordsResponse>('/api/record?folderId=' + folder?.id, 'GET', RecordDTOEncSettings) as Promise<GetRecordsResponse>;
    }

    async getPartial(params: { folderId: number; recordIds?: number[]; newerThan?: string; newerThanId?: number }): Promise<GetRecordsResponse> {
      const search = new URLSearchParams();
      search.append('folderId', String(params.folderId));
      if (params.recordIds && params.recordIds.length > 0) {
        search.append('recordIds', params.recordIds.join(','));
      }
      if (params.newerThan) {
        search.append('newerThan', params.newerThan);
      }
      if (params.newerThanId) {
        search.append('newerThanId', String(params.newerThanId));
      }
      return this.request<GetRecordsResponse>(`/api/record/partial?${search.toString()}`, 'GET', RecordDTOEncSettings) as Promise<GetRecordsResponse>;
    }
  
    async put(record: PutRecordRequest): Promise<PutRecordResponse> {
      return this.request<PutRecordResponse>('/api/record', 'PUT', RecordDTOEncSettings, record) as Promise<PutRecordResponse>;
    }

    async delete(record: RecordDTO): Promise<DeleteRecordResponse> {
      return this.request<DeleteRecordResponse>('/api/record/' + record.id, 'DELETE', { ecnryptedFields: [] }) as Promise<DeleteRecordResponse>;
    }

    async getLastUpdateDate(folderId: number): Promise<GetLastUpdateDateResponse> {
      return this.request<GetLastUpdateDateResponse>('/api/record/last-update?folderId=' + folderId, 'GET', { ecnryptedFields: [] }) as Promise<GetLastUpdateDateResponse>;
    }
}
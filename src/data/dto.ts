import { z } from 'zod';
import { getCurrentTS } from "@/lib/utils";

export type DTOEncryptionSettings = {
  ecnryptedFields: string[]
  temporaryServerKey?: KeyDTO & { encryptedKey: string }
}

export const folderDTOSchema = z.object({
  id: z.number().positive().optional(),
  name: z.string().min(1),
  json: z.string().optional().nullable(), // all additional fields are located in JSON field
  updatedAt: z.string().default(() => getCurrentTS()),
});

export const FolderDTOEncSettings: DTOEncryptionSettings =  { ecnryptedFields: ['name', 'json'] }
export type FolderDTO = z.infer<typeof folderDTOSchema>;

export const configDTOSchema = z.object({
  key: z.string().min(1),
  value: z.string().nullable(),
  updatedAt: z.string().default(() => getCurrentTS()),
});

export const ConfigDTOEncSettings: DTOEncryptionSettings =  { ecnryptedFields: ['value'] }
export type ConfigDTO = z.infer<typeof configDTOSchema>;

export enum KeyAuthorizationZone {
  Standard = '',
  Enclave = 'enclave'
}

export const keyDTOSchema = z.object({
  displayName: z.string().min(1),
  keyLocatorHash: z.string().min(64).max(64),
  keyHash: z.string().min(32),
  keyHashParams: z.string().min(1),
  databaseIdHash: z.string().min(64).max(64),
  encryptedMasterKey: z.string().min(1),
  acl: z.string().nullable().optional(),
  extra: z.string().nullable().optional(),
  expiryDate: z.string().nullable(),
  updatedAt: z.string().default(() => getCurrentTS()),
});

export const KeyDTOEncSettings: DTOEncryptionSettings =  { ecnryptedFields: [] }
export type KeyDTO = z.infer<typeof keyDTOSchema>;


export type AttachmentAssigmentDTO = {
  id: number;
  type: string;
}

export const EncryptedAttachmentDTOSchema = z.object({
  id: z.number().positive().optional(),
  displayName: z.string().min(1),
  description: z.string().optional().nullable(),

  mimeType: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  json: z.string().optional().nullable(),
  extra: z.string().optional().nullable(),

  size: z.number().positive().int(),
  storageKey: z.string().min(1),
  filePath: z.string().optional(),

  createdAt: z.string().default(() => getCurrentTS()),
  updatedAt: z.string().default(() => getCurrentTS()),

  // bc. we're using end 2 end encryption on the database level even JSON fields must be represented as string
  assignedTo: z.string().optional().nullable()
});
export const EncryptedAttachmentDTOEncSettings = { ecnryptedFields: ['displayName', 'description', 'mimeType', 'type', 'json', 'extra'] };
export type EncryptedAttachmentDTO = z.infer<typeof EncryptedAttachmentDTOSchema>;

export const operationDTOSchema = z.object({
  id: z.number().positive().optional(),
  recordId: z.number().positive().int(),
  operationId: z.string().min(1),
  operationName: z.string().min(1),
  operationProgress: z.number().int(),
  operationProgressOf: z.number().int(),
  operationPage: z.number().int(),
  operationPages: z.number().int(),
  operationMessage: z.string().optional().nullable(),
  operationTextDelta: z.string().optional().nullable(),
  operationPageDelta: z.string().optional().nullable(),
  operationRecordText: z.string().optional().nullable(),
  operationStartedOn: z.string().optional().nullable(),
  operationStartedOnUserAgent: z.string().optional().nullable(),
  operationStartedOnSessionId: z.string().optional().nullable(),
  operationLastStep: z.string().optional().nullable(),
  operationLastStepUserAgent: z.string().optional().nullable(),
  operationLastStepSessionId: z.string().optional().nullable(),
  operationFinished: z.boolean().optional(),
  operationErrored: z.boolean().optional(),
  operationErrorMessage: z.string().optional().nullable(),
})
export type OperationDTO = z.infer<typeof operationDTOSchema>;

export const recordDTOSchema = z.object({
  id: z.number().positive().optional(),
  folderId: z.number().positive().int(),

  description: z.string().optional().nullable(),
  type: z.string().min(1),
  title: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  text: z.string().nullable(),
  json: z.string().optional().nullable(),
  extra: z.string().optional().nullable(),
  transcription: z.string().nullable().optional(),

  checksum: z.string().optional().nullable(),
  checksumLastParsed: z.string().optional().nullable(),

  eventDate: z.string().default(() => getCurrentTS()),
  createdAt: z.string().default(() => getCurrentTS()),
  updatedAt: z.string().default(() => getCurrentTS()),

  operationName: z.string().optional().nullable(),
  operationProgress: z.object({
    operationName: z.string().optional().nullable(),
    processedOnDifferentDevice: z.boolean().optional().nullable(),
    message: z.string().optional().nullable(),
    page: z.number().positive().int(),
    pages: z.number().positive().int(),
    progress: z.number().positive().int(),
    progressOf: z.number().positive().int(),
  }).optional().nullable(),
  operationInProgress: z.boolean().optional().nullable(),

  // bc. we're using end 2 end encryption on the database level even JSON fields must be represented as string
  attachments: z.string().optional().nullable()
});

export const RecordDTOEncSettings = { ecnryptedFields: ['description', 'type', 'json', 'extra', 'text', 'attachments', 'title', 'tags'] }
export type RecordDTO = z.infer<typeof recordDTOSchema>;



export const databaseCreateRequestSchema = z.object({
  keyLocatorHash: z.string().min(64).max(64),
  keyHash: z.string().min(32),
  keyHashParams: z.string().min(1),
  databaseIdHash: z.string().min(1).min(64).max(64),
  encryptedMasterKey: z.string().min(1),
});
export type DatabaseCreateRequestDTO = z.infer<typeof databaseCreateRequestSchema>;


export const databaseAuthorizeChallengeRequestSchema = z.object({
  keyLocatorHash: z.string().min(64).max(64),
  databaseIdHash: z.string().min(1).min(64).max(64),
});
export type DatabaseAuthorizeChallengeRequestDTO = z.infer<typeof databaseAuthorizeChallengeRequestSchema>;

export const databaseAuthorizeRequestSchema = z.object({
  keyLocatorHash: z.string().min(64).max(64),
  keyHash: z.string().min(32),
  databaseIdHash: z.string().min(1).min(64).max(64),
});
export type DatabaseAuthorizeRequestDTO = z.infer<typeof databaseAuthorizeRequestSchema>;

export const deleteKeyRequestSchema = z.object({
  keyLocatorHash: z.string().min(64).max(64),
  keyHash: z.string().min(32),
  databaseIdHash: z.string().min(1).min(64).max(64),
});
export type DeleteKeyRequestDTO = z.infer<typeof deleteKeyRequestSchema>;

export const databaseRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export type DatabaseRefreshRequestDTO = z.infer<typeof databaseRefreshRequestSchema>;

export const keyHashParamsDTOSchema = z.object({
  salt: z.string(),
  time: z.number().positive().int(),
  mem: z.number().positive().int(),
  hashLen: z.number().positive().int(),
  parallelism: z.number().positive().int(),
});
export type KeyHashParamsDTO = z.infer<typeof keyHashParamsDTOSchema>;

export const keyACLSchema = z.object({
  role: z.string().min(1),
  features: z.array(z.string()).min(1),
});
export type KeyACLDTO = z.infer<typeof keyACLSchema>;
export const defaultKeyACL: KeyACLDTO = { role: 'guest', features: [] };

export const termsDTOSchema = z.object({
  id: z.number().positive().optional(),
  key: z.string().min(1).optional(),
  code: z.string().min(1),
  content: z.string().min(1),
  signature: z.string().optional(),
  ip: z.string().nullable().optional(),
  ua: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  signedAt: z.string().default(() => getCurrentTS()),
});
export type TermDTO = z.infer<typeof termsDTOSchema>;


export const saasDTOSchema = z.object({
  currentQuota: z.object({
    allowedDatabases: z.number().int(),
    allowedUSDBudget: z.number().int(),
    allowedTokenBudget: z.number().int()
  }),
  currentUsage: z.object({
      usedDatabases: z.number().int(),
      usedUSDBudget: z.number().int(),
      usedTokenBudget: z.number().int()
  }),
  email: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  saasToken: z.string(),
});
export type SaaSDTO = z.infer<typeof saasDTOSchema>;

// Stats DTO's 
export const statsSchema = z.object({
  id: z.number().positive().int().optional(),
  eventName: z.string().min(1),
  promptTokens: z.number().positive().int(),
  completionTokens: z.number().positive().int(),
  finishReasons: z.string().nullable().optional(),
  createdAt: z.string().default(() => getCurrentTS()),
  createdMonth:  z.number().positive().int().nullable().optional(),
  createdDay:  z.number().positive().int().nullable().optional(),
  createdYear:  z.number().positive().int().nullable().optional(),
  createdHour:  z.number().positive().int().nullable().optional(),
  counter: z.number().positive().int().optional()
})
export type StatDTO = z.infer<typeof statsSchema>;

export const auditDTOSchema = z.object({
  id: z.number().positive().int().optional(),
  ip: z.string().optional(),
  ua: z.string().optional(),
  keyLocatorHash: z.string().optional(),
  databaseIdHash: z.string().optional(),
  recordLocator: z.string().optional(),
  encryptedDiff: z.string().optional(),
  eventName: z.string().optional(),
  createdAt: z.string().default(() => getCurrentTS()).optional(),
});
export type AuditDTO = z.infer<typeof auditDTOSchema>;


export type AggregatedStatsDTO = {
  thisMonth: {
    overallTokens: number;
    promptTokens: number;
    completionTokens: number;
    overalUSD: number;
    requests: number;
  },
  lastMonth: {
    overallTokens: number;
    promptTokens: number;
    completionTokens: number;
    overalUSD: number;
    requests: number;
  },  
  today: {
    overallTokens: number;
    promptTokens: number;
    completionTokens: number;
    overalUSD: number;
    requests: number;
  },
}



export class ApiError extends Error {
  public code: number|string;
  public additionalData?: any;

  constructor(message: string, code: number|string, additionalData?: any) {
    super(message);
    this.code = code;
    this.additionalData = additionalData;
  }
}

import '@enhances/with-resolvers';
import React, { createContext, useState, useEffect, useContext, PropsWithChildren, useRef } from 'react';
import { EncryptedAttachmentDTO, EncryptedAttachmentDTOEncSettings, RecordDTO } from '@/data/dto';
import { RecordApiClient } from '@/data/client/record-api-client';
import { ApiEncryptionConfig, temporaryEncryptKeyForServer } from '@/data/client/base-api-client';
import { DataLoadingStatus, DisplayableDataObject, EncryptedAttachment, Folder, Record, PostParseCallback, RegisteredOperations, AVERAGE_PAGE_TOKENS } from '@/data/client/models';
import { ConfigContext, ConfigContextType } from '@/contexts/config-context';
import { toast } from 'sonner';
import { sort } from 'fast-sort';
import { EncryptedAttachmentApiClient } from '@/data/client/encrypted-attachment-api-client';
import { DatabaseContext, DatabaseContextType } from './db-context';
import { ChatContext, CreateMessageEx, MessageType, MessageVisibility, OnResultCallback } from './chat-context';
import { convertDataContentToBase64String } from "ai";
import { convert } from '@/lib/pdf2js-browser'
import { prompts } from "@/data/ai/prompts";
import { parse as chatgptParseRecord } from '@/ocr/ocr-chatgpt-provider';
import { parse as tesseractParseRecord } from '@/ocr/ocr-tesseract-provider';
import { parse as geminiParseRecord } from '@/ocr/ocr-gemini-provider';
import { FolderContext } from './folder-context';
import { findCodeBlocks, getCurrentTS, getErrorMessage, getTS } from '@/lib/utils';
import { parse } from 'path';
import { CreateMessage, Message } from 'ai/react';
import { DTOEncryptionFilter, EncryptionUtils, sha256 } from '@/lib/crypto';
import { jsonrepair } from 'jsonrepair'
import { GPTTokens } from 'gpt-tokens'
import JSZip, { file } from 'jszip'
import { saveAs } from 'file-saver';
import filenamify from 'filenamify/browser';
import showdown from 'showdown'
import { diff, addedDiff, deletedDiff, updatedDiff, detailedDiff } from 'deep-object-diff';
import { AuditContext } from './audit-context';
import { SaaSContext } from './saas-context';
import { nanoid } from 'nanoid';
import { parse as chatgptPagedParseRecord } from '@/ocr/ocr-llm-provider-paged';
import { PdfConversionApiClient } from '@/data/client/pdf-conversion-api-client';
import { isIOS } from '@/lib/utils';
import { OperationsApiClient } from '@/data/client/operations-api-client';
import { temporaryServerEncryptionKey } from '@/lib/shared-key-helpers';


// Add the helper function before the parseQueueInProgress variable
const discoverEventDate = (record: Record): string => {

  // Check if eventDate is NaN and use createdAt as fallback
  if (record.eventDate && isNaN(Date.parse(record.eventDate))) {
    return record.createdAt;
  }

  if (record.eventDate) {
    return record.eventDate;
  }

  if (record.json && Array.isArray(record.json)) {
    // Try to find any date field in the JSON data
    const dateFields = ['test_date', 'admission_date', 'visit_date', 'procedure_date', 'examination_date', 'date'] as const;

    for (const field of dateFields) {
      const item = record.json.find(item => {
        const value = item as { [key: string]: unknown };
        return value[field] !== undefined;
      });

      if (item) {
        const value = item as { [key: string]: unknown };
        const foundDate = value[field];
        if (foundDate && (typeof foundDate === 'string' || foundDate instanceof Date)) {
          const parsedDate = getTS(new Date(foundDate));
          if (parsedDate) {
            return parsedDate;
          }
        }
      }
    }
  }

  // If no specific date found, use createdAt as fallback
  return record.createdAt;
};



export const getRecordExtra = async (record: Record, type: string) => {
  return record.extra?.find(p => p.type === type)?.value;
}

let parseQueueInProgress = false;
let parseQueue: Record[] = []
let parseQueueLength = 0;

// Add this at the top, after parseQueue definition
let autoTranslateAfterParse = new Set<number>();

// Add this after autoTranslateAfterParse definition
let recordsBeingTranslated = new Set<number>();

// Parsing progress state: recordId -> { progress, progressOf, metadata, textDelta, pageDelta, history: [] }
// We'll use a React state for this, so move it into the provider below.

export type FilterTag = {
  tag: string;
  freq: number;
}

export enum AttachmentFormat {
  dataUrl = 'dataUrl',
  blobUrl = 'blobUrl',
  blob = 'blob'
}

export type RecordContextType = {
  records: Record[];
  filteredRecords: Record[];
  recordEditMode: boolean;
  parseQueueLength: number;
  setRecordEditMode: (editMode: boolean) => void;
  recordDialogOpen: boolean;
  setRecordDialogOpen: (open: boolean) => void;
  currentRecord: Record | null;
  updateRecord: (record: Record) => Promise<Record>;
  deleteRecord: (record: Record) => Promise<boolean>;
  listRecords: (forFolder: Folder) => Promise<Record[]>;
  listRecordsPartial: (forFolder: Folder, recordIds?: number[], newerThan?: string, newerThanId?: number, updateAvailableTags?: boolean) => Promise<Record[]>;
  setCurrentRecord: (record: Record | null) => void; // new method
  loaderStatus: DataLoadingStatus;
  operationStatus: DataLoadingStatus;
  setOperationStatus: (status: DataLoadingStatus) => void;

  updateRecordFromText: (text: string, record?: Record | null, allowNewRecord?: boolean, extra?: { type: string, value: string }[]) => Promise<Record | null>;
  getAttachmentData: (attachmentDTO: EncryptedAttachmentDTO, type: AttachmentFormat) => Promise<string | Blob>;
  downloadAttachment: (attachment: EncryptedAttachmentDTO, useCache: boolean) => void;
  convertAttachmentsToImages: (record: Record, statusUpdates: boolean) => Promise<DisplayableDataObject[]>;
  extraToRecord: (type: string, promptText: string, record: Record) => void;
  parseRecord: (record: Record, postParseCallback?: PostParseCallback) => void;
  sendRecordToChat: (record: Record, forceRefresh: boolean) => void;
  sendAllRecordsToChat: (customMessage: CreateMessageEx | null, providerName?: string, modelName?: string, onResult?: OnResultCallback) => void;

  processParseQueue: () => void;
  filterAvailableTags: FilterTag[];
  filterSelectedTags: string[];
  setFilterSelectedTags: (selectedTags: string[]) => void;
  filterToggleTag: (tag: string) => void;

  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;

  sortBy: string;
  setSortBy: (sortBy: string) => void;

  getTagsTimeline: () => { year: string, freq: number }[];

  exportRecords: () => void;
  importRecords: (zipFileInput: ArrayBuffer) => void;
  setRecordExtra: (record: Record, type: string, value: string) => Promise<Record>;
  removeRecordExtra: (record: Record, type: string) => Promise<Record>;
  translateRecord: (record: Record, language?: string) => Promise<Record>;
  operationProgressByRecordId: {
    [recordId: string]: {
      operationName: string;
      progress: number;
      progressOf: number;
      page: number;
      pages: number;
      message?: string;
      processedOnDifferentDevice?: boolean;
      metadata: any;
      textDelta: string;
      pageDelta: string;
      recordText?: string;
      history: { operationName: string; progress: number; progressOf: number; page: number; pages: number; processedOnDifferentDevice?: boolean; message?: string; metadata: any; textDelta: string; pageDelta: string; recordText?: string; timestamp: number }[];
    }
  };
  parsingDialogOpen: boolean;
  setParsingDialogOpen: (open: boolean) => void;
  parsingDialogRecordId: string | null;
  setParsingDialogRecordId: (id: string | null) => void;
  checkAndRefreshRecords: (forFolder: Folder, forceRefresh?: boolean) => Promise<string | void>;
  startAutoRefresh: (forFolder: Folder) => void;
  stopAutoRefresh: () => void;
  lastRefreshed: Date | null;
  visibleRecordIds: Set<number>;
  addVisibleRecordId: (recordId: number) => void;
  removeVisibleRecordId: (recordId: number) => void;
}

export const RecordContext = createContext<RecordContextType | null>(null);

export const RecordContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [recordEditMode, setRecordEditMode] = useState<boolean>(false);
  const [recordDialogOpen, setRecordDialogOpen] = useState<boolean>(false);
  const [records, setRecords] = useState<Record[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<Record[]>([]);
  const [loaderStatus, setLoaderStatus] = useState<DataLoadingStatus>(DataLoadingStatus.Idle);
  const [operationStatus, setOperationStatus] = useState<DataLoadingStatus>(DataLoadingStatus.Idle);
  const [currentRecord, setCurrentRecord] = useState<Record | null>(null); // new state
  const [filterAvailableTags, setFilterAvailableTags] = useState<FilterTag[]>([]);
  const [filterSelectedTags, setFilterSelectedTags] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('id desc');
  const [operationProgressByRecordId, setOperationProgressByRecordId] = useState<{
    [recordId: string]: {
      operationName: string;
      page: number;
      pages: number;
      progress: number;
      progressOf: number;
      message?: string;
      metadata: any;
      textDelta: string;
      pageDelta: string;
      recordText?: string;
      history: { operationName: string; progress: number; progressOf: number; page: number; pages: number; message?: string; metadata: any; textDelta: string; pageDelta: string; recordText?: string; timestamp: number }[];
    }
  }>({});
  const [parsingDialogOpen, setParsingDialogOpen] = useState(false);
  const [parsingDialogRecordId, setParsingDialogRecordId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [visibleRecordIds, setVisibleRecordIds] = useState<Set<number>>(new Set());
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dbContextRef = useRef<DatabaseContextType | null>(null);
  const lastListRecordsExecutionTimeRef = useRef<number>(0); // Store execution time in milliseconds


  useEffect(() => { // filter records when tags change
    console.log('Selected tags', filterSelectedTags);

    setFilteredRecords(records.filter(record => { // using AND operand (every), if we want to have OR then we should do (some)
      if (!filterSelectedTags || filterSelectedTags.length === 0) {
        return true;
      } else {
        return record.tags ? filterSelectedTags.every(tag => record.tags && record.tags.includes(tag)) : false;
      }
    }));
  }, [filterSelectedTags, records]);


  const config = useContext(ConfigContext);
  const dbContext = useContext(DatabaseContext)
  const saasContext = useContext(SaaSContext);
  const chatContext = useContext(ChatContext);
  const folderContext = useContext(FolderContext)
  const auditContext = useContext(AuditContext);

  const cache = async () => {
    return await caches.open('recordContext');
  }

  const filterToggleTag = (tag: string) => {
    if (filterSelectedTags.includes(tag)) {
      setFilterSelectedTags(prev => prev.filter(t => t !== tag));
    } else {
      setFilterSelectedTags(prev => [...prev, tag]);
    }
  }

  const getTagsTimeline = (): { year: string, freq: number }[] => {
    const uniqueYears: { [year: string]: number } = {};

    records.forEach(record => {
      if (record.tags) {
        record.tags.forEach(tag => {
          const year = parseInt(tag);
          if (!isNaN(year) && year >= 1900) {
            if (uniqueYears[tag]) {
              uniqueYears[tag]++;
            } else {
              uniqueYears[tag] = 1;
            }
          }
        });
      }
    });

    const timeline = Object.entries(uniqueYears).map(([year, freq]) => ({
      year,
      freq
    }));

    return timeline;
  }

  const updateRecord = async (record: Record): Promise<Record> => {
    try {
      setOperationStatus(DataLoadingStatus.Loading);
      const client = await setupApiClient(config);

      if (record.json && record.json.length > 0) {
        if (record.json[0].title && !record.title) {
          record.title = record.json[0].title;
        }
        if (record.json[0].summary && !record.description) {
          record.description = record.json[0].summary;
        }
        if (!record.tags || record.tags.length === 0) {
          const uniqueTags = record.json.reduce((tags: string[], item: any) => {
            if (item.tags && Array.isArray(item.tags)) {
              const newTags = item.tags.filter((tag: string) => !tags.includes(tag));
              return [...tags, ...newTags];
            }
            return tags;
          }, []);
          record.tags = uniqueTags;
        }

        // Check for language in extra field and add corresponding tag
        const languageExtra = record.extra?.find(e => e.type === 'Translation language')?.value || record.json?.find(e => e.language)?.language;
        if (languageExtra && typeof languageExtra === 'string') {
          const languageTag = `Language: ${languageExtra}`;
          if (!record.tags) {
            record.tags = [languageTag];
          } else if (!record.tags.includes(languageTag)) {
            record.tags.push(languageTag);
          }
        }

      }

      // Use the helper function to discover event date
      record.eventDate = discoverEventDate(record);

      // Update checksum to reflect current state of attachments and transcription
      await record.updateChecksum();

      const recordDTO = record.toDTO(); // DTOs are common ground between client and server
      const response = await client.put(recordDTO);
      const newRecord = typeof record?.id === 'undefined'


      if (response.status !== 200) {
        console.error('Error adding folder record:', response.message);
        toast.error('Error adding folder record');
        setOperationStatus(DataLoadingStatus.Error);
        return record;
      } else {
        const updatedRecord = new Record({ ...record, id: response.data.id } as Record);
        const prevRecord = records.find(r => r.id === record.id);
        if (newRecord) {
          // Check if this is a programmatically created record (like a translation)
          // These records already have JSON content and shouldn't be parsed
          const isProgrammaticallyCreated = !isUserUploadedRecord(record);
          
          if (!isProgrammaticallyCreated) {
            // Only set in progress and parse for user-uploaded records
            updatedRecord.operationInProgress = true;
            updateOperationProgressState(updatedRecord, 'parse', 0,0,0,0, null);
            
            // Call parseRecord immediately for new records
            // Also trigger auto-translate if enabled
            const autoTranslate = await config?.getServerConfig('autoTranslateRecord');
            if (autoTranslate && response.data.id !== undefined) {
              autoTranslateAfterParse.add(response.data.id);
            }
            parseRecord(updatedRecord);
          } else {
            console.debug('Skipping parse for programmatically created record:', record.id);
          }
        }

        setRecords(prevRecords =>
          newRecord ? [...prevRecords, updatedRecord] :
            prevRecords.map(pr => pr.id === updatedRecord.id ? updatedRecord : pr)
        )

        if (dbContext) auditContext?.record({ eventName: prevRecord ? 'updateRecord' : 'createRecord', encryptedDiff: prevRecord ? JSON.stringify(detailedDiff(prevRecord, updatedRecord)) : '', recordLocator: JSON.stringify([{ recordIds: [updatedRecord.id] }]) });

        //chatContext.setRecordsLoaded(false); // reload context next time - TODO we can reload it but we need time framed throthling #97
        setOperationStatus(DataLoadingStatus.Success);
        return updatedRecord;
      }
    } catch (error) {
      console.error('Error adding folder record:', error);
      toast.error('Error adding folder record');
      setOperationStatus(DataLoadingStatus.Error);
      return record;
    }
  };

  const updateRecordFromText = async (text: string, record: Record | null = null, allowNewRecord = true, extra?: { type: string, value: string }[]): Promise<Record | null> => {
    let recordMarkdown = "";
    try {
      if (text.indexOf('```json') > -1) {
        const codeBlocks = findCodeBlocks(text.trimEnd().endsWith('```') ? text : text + '```', false);
        let recordJSON = [];
        if (codeBlocks.blocks.length > 0) {
          for (const block of codeBlocks.blocks) {
            if (block.syntax === 'json') {
              const jsonObject = JSON.parse(jsonrepair(block.code));
              if (Array.isArray(jsonObject)) {
                for (const recordItem of jsonObject) {
                  recordJSON.push(recordItem);
                }
              } else recordJSON.push(jsonObject);
            }

            if (block.syntax === 'markdown') {
              recordMarkdown += block.code;
            }
          }
          if (recordJSON.length > 0) {
            const hasError = recordJSON.find(item => item.error);
            if (hasError) {
              toast.error('Uploaded file is not valid health data. Record will be deleted: ' + hasError.error);
              if (record) {
                await deleteRecord(record);
                auditContext.record({ eventName: 'invalidRecord', recordLocator: JSON.stringify([{ recordIds: [record.id] }]) });
              }
              return null;
            }
          }
          const discoveredEventDate = getTS(new Date(recordJSON.length > 0 ? recordJSON.find(item => item.test_date)?.test_date || recordJSON.find(item => item.admission_date)?.admission_date : record?.createdAt));
          const discoveredType = recordJSON.length > 0 ? recordJSON.map(item => item.subtype ? item.subtype : item.type).join(", ") : 'note';
          if (record) {
            const recordDTO = record.toDTO();
            const updatedRecord = Record.fromDTO({
              ...recordDTO,
              json: JSON.stringify(recordJSON),
              text: recordMarkdown || null,
              type: discoveredType,
              eventDate: discoveredEventDate,
              extra: extra ? JSON.stringify([...(record.extra || []), ...extra]) : recordDTO.extra
            });
            return await updateRecord(updatedRecord);
          } else {
            if (allowNewRecord && folderContext?.currentFolder?.id) { // create new folder Record
              const newRecord = Record.fromDTO({
                folderId: folderContext?.currentFolder?.id,
                type: discoveredType,
                createdAt: getCurrentTS(),
                updatedAt: getCurrentTS(),
                json: JSON.stringify(recordJSON),
                text: recordMarkdown || null,
                eventDate: discoveredEventDate,
                extra: extra ? JSON.stringify(extra) : '[]',
                attachments: '[]',
                checksum: '',
                checksumLastParsed: ''
              });
              return await updateRecord(newRecord);
            }
          }
          console.log('JSON repr: ', recordJSON);
        }
      } else { // create new folder Record for just plain text
        if (allowNewRecord && folderContext?.currentFolder?.id) { // create new folder Record
          return new Promise<Record | null>((resolve) => {
            chatContext.aiDirectCall([{ role: 'user', content: prompts.generateRecordMetaData({ record: null, config }, text), id: nanoid() }], (result) => {
              console.log('Meta data: ', result.content);
              let metaData = {} as any;
              const codeBlocks = findCodeBlocks(result.content.endsWith('```') ? result.content : result.content + '```', false);
              if (codeBlocks.blocks.length > 0) {
                for (const block of codeBlocks.blocks) {
                  if (block.syntax === 'json') {
                    const jsonObject = JSON.parse(jsonrepair(block.code));
                    metaData = jsonObject;
                  }
                }
              }

              try {
                const recordDTO: RecordDTO = {
                  folderId: folderContext?.currentFolder?.id as number,
                  type: 'note',
                  createdAt: getCurrentTS(),
                  updatedAt: getCurrentTS(),
                  eventDate: getCurrentTS(),
                  json: JSON.stringify(metaData),
                  text: recordMarkdown || text,
                  attachments: '[]',
                  checksum: '',
                  checksumLastParsed: '',
                  title: metaData.title || null,
                  description: metaData.summary || null,
                  tags: JSON.stringify(metaData.tags || []),
                  extra: extra ? JSON.stringify(extra) : JSON.stringify(metaData.extra || []),
                  transcription: null
                };
                const newRecord = Record.fromDTO(recordDTO);
                updateRecord(newRecord).then((updatedRecord) => {
                  resolve(updatedRecord);
                }).catch((error) => {
                  toast.error('Error creating record from text.');
                  setOperationStatus(DataLoadingStatus.Error);
                  resolve(null);
                });
              } catch (error) {
                toast.error('Error creating record from text.');
                setOperationStatus(DataLoadingStatus.Error);
                resolve(null);
              }
            }, 'chatgpt', 'gpt-4o'); // using small model for summary
          });
        }
      }
      return null;
    } catch (error) {
      toast.error('Error processing text: ' + getErrorMessage(error));
      setOperationStatus(DataLoadingStatus.Error);
      return null;
    }
  }

  const deleteRecord = async (record: Record) => {
    const prClient = await setupApiClient(config);
    const attClient = await setupAttachmentsApiClient(config);

    // Check for preserved attachments
    const preservedAttachmentsExtra = record.extra?.find(e => e.type === 'Preserved attachments')?.value;
    const preservedAttachmentIds = typeof preservedAttachmentsExtra === 'string' ? preservedAttachmentsExtra.split(',').map(id => id.trim()) : [];

    if (record.attachments.length > 0) {
      for (const attachment of record.attachments) {
        // Skip deletion if attachment is preserved
        if (preservedAttachmentIds.includes(attachment.id?.toString() || '')) {
          console.log('Skipping deletion of preserved attachment:', attachment.id);
          continue;
        }
        const result = await attClient.delete(attachment.toDTO());
        if (result.status !== 200) {
          toast.error('Error removing attachment: ' + attachment.displayName)
        }
      }
    }
    const result = await prClient.delete(record)
    if (result.status !== 200) {
      toast.error('Error removing folder record: ' + result.message)
      return Promise.resolve(false);
    } else {
      toast.success('Folder record removed successfully!')
      setRecords(prvRecords => prvRecords.filter((pr) => pr.id !== record.id));
      if (dbContext) auditContext.record({ eventName: 'deleteRecord', recordLocator: JSON.stringify([{ recordIds: [record.id] }]) });

      //chatContext.setRecordsLoaded(false); // reload context next time        
      return Promise.resolve(true);
    }
  };

  // Shared helper function for processing fetched records
  const processFetchedRecords = async (
    fetchedRecords: Record[], 
    updateAvailableTags: boolean = false,
    executionTime: number
  ) => {
    // Only update available tags if requested (for full refresh)
    if (updateAvailableTags) {
      const fetchedTags = fetchedRecords.reduce((tags: FilterTag[], record: Record) => {
        const uniqueTags = record.tags && record.tags.length > 0 ? record.tags : [];
        uniqueTags.forEach(tag => {
          const existingTag = tags.find(t => t.tag === tag);
          if (existingTag) {
            existingTag.freq++;
          } else {
            tags.push({ tag, freq: 1 });
          }
        });
        return tags;
      }, []);

      setFilterAvailableTags(fetchedTags);
    }
    
    // Check for recent operations and update operationInProgress status
    // This will also merge the fetched records with existing records and return the final merged list
    const recordsWithOperationStatus = await checkRecentOperations(fetchedRecords);
    
    // Set the final merged records in state
    setRecords(recordsWithOperationStatus || []);
    
    setLastRefreshed(new Date());
    setLoaderStatus(DataLoadingStatus.Success);
    
    // Auto-parse records that need parsing
    if (recordsWithOperationStatus) {
      await autoParseRecords(recordsWithOperationStatus);
    }
    
    // Calculate and store execution time
    lastListRecordsExecutionTimeRef.current = executionTime;
    console.log(`Records processing execution time: ${executionTime}ms`);
    
    return recordsWithOperationStatus || [];
  };

  const listRecords = async (forFolder: Folder) => {
    const startTime = Date.now();
    try {
      const client = await setupApiClient(config);
      setLoaderStatus(DataLoadingStatus.Loading);
      const response = await client.get(forFolder.toDTO());
      const fetchedRecords = response.map((recordDTO: RecordDTO) => Record.fromDTO(recordDTO));

      const executionTime = Date.now() - startTime;
      return await processFetchedRecords(fetchedRecords, true, executionTime);
    } catch (error) {
      // Calculate execution time even on error
      const executionTime = Date.now() - startTime;
      lastListRecordsExecutionTimeRef.current = executionTime;
      console.log(`listRecords execution time (error): ${executionTime}ms`);
      
      setLoaderStatus(DataLoadingStatus.Error);
      toast.error('Error listing folder records');
      return Promise.reject(error);
    }
  };

  const listRecordsPartial = async (forFolder: Folder, recordIds?: number[], newerThan?: string, newerThanId?: number, updateAvailableTags: boolean = false) => {
    const startTime = Date.now();
    try {
      const client = await setupApiClient(config);
      setLoaderStatus(DataLoadingStatus.Loading);
      
      const response = await client.getPartial({
        folderId: forFolder.id!,
        recordIds,
        newerThan,
        newerThanId
      });
      
      const fetchedRecords = response.map((recordDTO: RecordDTO) => Record.fromDTO(recordDTO));

      const executionTime = Date.now() - startTime;
      return await processFetchedRecords(fetchedRecords, updateAvailableTags, executionTime);
    } catch (error) {
      // Calculate execution time even on error
      const executionTime = Date.now() - startTime;
      lastListRecordsExecutionTimeRef.current = executionTime;
      console.log(`listRecordsPartial execution time (error): ${executionTime}ms`);
      
      setLoaderStatus(DataLoadingStatus.Error);
      toast.error('Error listing partial records');
      return Promise.reject(error);
    }
  };

  // Helper function to check if a record is user-uploaded (should be parsed) vs programmatically created (should not be parsed)
  const isUserUploadedRecord = (record: Record): boolean => {
    // Check if record has translation-related extra fields
    const hasTranslationLanguage = record.extra?.find(e => e.type === 'Translation language');
    const hasReferenceRecordIds = record.extra?.find(e => e.type === 'Reference record Ids');
    const hasPreservedAttachments = record.extra?.find(e => e.type === 'Preserved attachments');
    
    // If record has any of these fields, it's programmatically created (translation, etc.)
    if (hasTranslationLanguage || hasReferenceRecordIds || hasPreservedAttachments) {
      console.debug('Skipping programmatically created record:', record.id, 'translation language:', !!hasTranslationLanguage, 'reference ids:', !!hasReferenceRecordIds, 'preserved attachments:', !!hasPreservedAttachments);
      return false;
    }
    
    // Only parse records with attachments - records without attachments should not be parsed
    const hasAttachments = record.attachments && record.attachments.length > 0;
    
    if (!hasAttachments) {
      console.debug('Skipping record without attachments:', record.id, 'attachments count:', record.attachments?.length || 0);
      return false;
    }
    
    return true;
  };

  // Helper function to auto-parse records that need parsing
  const autoParseRecords = async (records: Record[]) => {
    if (!config) return;
    
    const autoParseEnabled = await config.getServerConfig('autoParseRecord');
    if (!autoParseEnabled) return;

    const autoTranslate = await config.getServerConfig('autoTranslateRecord');
    console.log('Auto-parse enabled:', autoParseEnabled, 'Auto-translate enabled:', autoTranslate);
    
    for (const record of records) {
      // Only parse user-uploaded records, not programmatically created ones
      if (!isUserUploadedRecord(record)) {
        console.debug('Skipping non-user-uploaded record for auto-parsing:', record.id);
        continue;
      }
      
      // Check if record needs parsing: 
      // 1. No json object defined (never parsed) OR checksum mismatch (content changed)
      // 2. Not in progress
      // 3. No errors
      // 4. Updated within last hour
      const hasJson = record.json && record.json.length > 0;
      const checksumMismatch = record.checksum !== record.checksumLastParsed;
      const needsParsing = (!hasJson || checksumMismatch) && 
          !record.operationInProgress && 
          !record.operationError && 
          (new Date().getTime() - new Date(record.updatedAt).getTime()) < 1000 * 60 * 60;
      
      if (needsParsing) {
        console.log('Adding to parse queue - needs parsing:', record.id, 'json exists:', hasJson, 'checksum mismatch:', checksumMismatch, 'checksum:', record.checksum, 'checksumLastParsed:', record.checksumLastParsed);
        
        if (autoTranslate) {
          console.log('Auto-translate enabled, will trigger after parse for record:', record.id);
          autoTranslateAfterParse.add(record.id!);
          parseRecord(record);
        } else {
          console.log('Auto-translate disabled');
          parseRecord(record);
        }
      } else {
        console.debug('Skipping record - already parsed:', record.id, 'json exists:', hasJson, 'checksum match:', !checksumMismatch, 'checksum:', record.checksum, 'checksumLastParsed:', record.checksumLastParsed);
        
        // Even if record is already parsed, check if auto-translation is needed
        if (autoTranslate) {
          // Check if this record already has translations
          const hasTranslations = record.extra?.find(e => e.type === 'Reference record Ids');
          if (!hasTranslations) {
            console.log('Auto-translate enabled for already parsed record:', record.id);
            
            // Check for ongoing translation operations to prevent duplicate translations
            const translationOperationCheck = await checkOngoingOperation(record.id || 0, RegisteredOperations.Translate);
            
            if (translationOperationCheck.hasOngoingOperation) {
              if (translationOperationCheck.isDifferentSession) {
                console.log('Translation already in progress on different session for record:', record.id);
                // Don't start translation if it's already running on a different session
                continue;
              } else {
                console.log('Translation already in progress on same session for record:', record.id);
                // Don't start translation if it's already running on the same session
                continue;
              }
            }
            
            // Call translateRecord directly since the record is already parsed
            try {
              await translateRecord(record);
              console.log('Auto-translate completed for already parsed record:', record.id);
            } catch (error) {
              console.error('Error auto-translating already parsed record:', record.id, error);
            }
          } else {
            console.debug('Record already has translations, skipping auto-translate:', record.id);
          }
        }
      }
    }
    
    // Process the parse queue
    processParseQueue();
  };

  // Helper function to clear finished operations from operation progress state
  const clearFinishedOperations = (operations: any[]) => {
    const finishedOperations = operations.filter(op => 
      (op.operationFinished || op.operationErrored) && 
      op.operationLastStep
    );
    
    if (finishedOperations.length > 0) {
      console.log(`Clearing ${finishedOperations.length} finished operations from progress state`);
      
      setOperationProgressByRecordId(prev => {
        const updated = { ...prev };
        finishedOperations.forEach(op => {
          const recordId = op.recordId?.toString();
          if (recordId && updated[recordId]) {
            console.log('Clearing operation progress state for finished operation:', recordId, op.operationName);
            delete updated[recordId];
          }
        });
        return updated;
      });
    }
    
    return finishedOperations;
  };

  const checkRecentOperations = async (records: Record[]) => {
    try {
      const operationsApi = getOperationsApiClient();
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      
      // Get record IDs that are currently in the list
      const recordIds = records.map(record => record.id).filter(id => id !== undefined) as number[];
      
      if (recordIds.length === 0) {
        // If no records to check, just merge fetched records with existing records
        return mergeRecordsWithExisting(records);
      }
      
      // Fetch operations for all records in a single request
      const response = await operationsApi.get({ recordIds });

      if ('data' in response && Array.isArray(response.data)) {
        // First, clear any finished operations from the progress state
        clearFinishedOperations(response.data);
        
        const recentOperations = response.data.filter(op => 
          op.operationLastStep && 
          new Date(op.operationLastStep) > new Date(twoMinutesAgo) &&
          !op.operationFinished &&
          !op.operationErrored
        );
        
        const recordIdsWithRecentOperations = new Set(recentOperations.map(op => op.recordId));
        
        // Update records with recent operations
        const updatedRecords = records.map(record => {
          const updatedRecord = new Record(record);
          const hasRecentOperation = recordIdsWithRecentOperations.has(record.id || 0);
          
          if (hasRecentOperation) {
            updatedRecord.operationInProgress = true;
            
            // Find the operation for this record
            const operation = recentOperations.find(op => op.recordId === record.id);
            if (operation) {
              // Use shared helper to check operation status
              const operationCheck = {
                hasOngoingOperation: true,
                isDifferentSession: operation.operationLastStepSessionId && operation.operationLastStepSessionId !== dbContextRef.current?.authorizedSessionId,
                operation: operation,
                shouldResume: (operation.operationName === RegisteredOperations.Parse || operation.operationName === RegisteredOperations.Translate) && operation.operationLastStepSessionId === dbContextRef.current?.authorizedSessionId
              };
              
              if (operationCheck.isDifferentSession) {
                const message = `Operation started on ${operation.operationStartedOnUserAgent} last data chunk received on ${operation.operationLastStep}`;
                
                // Update operation progress state with processedOnDifferentDevice flag
                updateOperationProgressState(
                  updatedRecord, 
                  operation.operationName || 'unknown', 
                  operation.operationProgress || 0, 
                  operation.operationProgressOf || 0, 
                  operation.operationPage || 0, 
                  operation.operationPages || 0, 
                  { 
                    message, 
                    processedOnDifferentDevice: true,
                    textDelta: operation.operationTextDelta || '',
                    pageDelta: operation.operationPageDelta || '',
                    recordText: operation.operationRecordText || ''
                  }
                );
              } else {
                // Same session, just update the operation progress state
                updateOperationProgressState(
                  updatedRecord, 
                  operation.operationName || 'unknown', 
                  operation.operationProgress || 0, 
                  operation.operationProgressOf || 0, 
                  operation.operationPage || 0, 
                  operation.operationPages || 0, 
                  { 
                    message: operation.operationMessage || '',
                    processedOnDifferentDevice: false,
                    textDelta: operation.operationTextDelta || '',
                    pageDelta: operation.operationPageDelta || '',
                    recordText: operation.operationRecordText || ''
                  }
                );
                
                // Resume operations for records that are in progress but not finished and belong to current session
                if (operationCheck.shouldResume) {
                  if (operation.operationName === RegisteredOperations.Parse) {
                    console.log('Resuming parsing for record:', record.id, 'from same session');
                    
                    // Check if record is not already in parse queue
                    if (!parseQueue.find(pr => pr.id === record.id)) {
                      // Add to parse queue to resume parsing
                      parseQueue.push(updatedRecord);
                      parseQueueLength = parseQueue.length;
                      console.log('Added to parse queue for resuming: ', parseQueue.length);
                    }
                  } else if (operation.operationName === RegisteredOperations.Translate) {
                    console.log('Resuming translation for record:', record.id, 'from same session');
                    
                    // Resume translation by calling translateRecord (fire and forget)
                    translateRecord(updatedRecord).then(() => {
                      console.log('Translation resumed and completed for record:', record.id);
                    }).catch((error) => {
                      console.error('Error resuming translation for record:', record.id, error);
                    });
                  }
                }
              }
            }
          }
          
          return updatedRecord;
        });
        
        // Merge the updated records with existing records and return the final merged list
        const finalMergedRecords = mergeRecordsWithExisting(updatedRecords);
        
        // Process the parse queue if we added any records for resuming
        if (parseQueue.length > 0 && !parseQueueInProgress) {
          processParseQueue();
        }
        
        return finalMergedRecords;
      }
    } catch (error) {
      console.error('Error checking recent operations:', error);
    }
    
    // If there was an error or no operations found, just merge fetched records with existing records
    return mergeRecordsWithExisting(records);
  };

  // Helper function to merge fetched records with existing records
  const mergeRecordsWithExisting = (fetchedRecords: Record[]): Record[] => {
    const currentRecords = records; // Get current records from state
    const updatedRecords = [...currentRecords];
    fetchedRecords.forEach(fetchedRecord => {
      const existingIndex = updatedRecords.findIndex(r => r.id === fetchedRecord.id);
      if (existingIndex >= 0) {
        updatedRecords[existingIndex] = fetchedRecord;
      } else {
        updatedRecords.push(fetchedRecord);
      }
    });
    return updatedRecords;
  };

  const setupApiClient = async (config: ConfigContextType | null) => {
    const masterKey = dbContextRef.current?.masterKey;
    const encryptionConfig: ApiEncryptionConfig = {
      secretKey: masterKey,
      useEncryption: true
    };
    const client = new RecordApiClient('', dbContextRef.current, saasContext, encryptionConfig);
    return client;
  }

  const setupAttachmentsApiClient = async (config: ConfigContextType | null) => {
    const masterKey = dbContextRef.current?.masterKey;
    const encryptionConfig: ApiEncryptionConfig = {
      secretKey: masterKey,
      useEncryption: true
    };
    const client = new EncryptedAttachmentApiClient('', dbContextRef.current, saasContext, encryptionConfig);
    return client;
  }

  const getAttachmentData = async (attachmentDTO: EncryptedAttachmentDTO, type: AttachmentFormat, useCache = true, temporaryPassEncryptionKey: boolean = false): Promise<string | Blob> => {
    const cacheStorage = await cache();
    const cacheKey = `${attachmentDTO.storageKey}-${attachmentDTO.id}-${type}`;
    const attachmentDataUrl = await cacheStorage.match(cacheKey);

    if (attachmentDataUrl && useCache) {
      console.log('Attachment loaded from cache ', attachmentDTO)
      return attachmentDataUrl.text();
    }

    console.log('Download attachment', attachmentDTO);

    const client = await setupAttachmentsApiClient(config);
    const arrayBufferData = temporaryPassEncryptionKey ? await client.getDecryptedServerSide(attachmentDTO, await temporaryServerEncryptionKey(dbContextRef.current!, saasContext)) : await client.get(attachmentDTO);    // decrypt on server side if needed

    if (type === AttachmentFormat.blobUrl) {
      const blob = new Blob([arrayBufferData], { type: attachmentDTO.mimeType + ";charset=utf-8" });
      const url = URL.createObjectURL(blob);
      if (useCache) cacheStorage.put(cacheKey, new Response(url))
      return url;
    } else if (type === AttachmentFormat.blob) {
      const blob = new Blob([arrayBufferData]);
      //          if(useCache) cacheStorage.put(cacheKey, new Response(blob, { headers: { 'Content-Type': attachmentDTO.mimeType as string } })) we're skipping cache for BLOBs as there was some issue with encoding for that case
      return blob;
    } else {
      const url = 'data:' + attachmentDTO.mimeType + ';base64,' + convertDataContentToBase64String(arrayBufferData);
      if (useCache) cacheStorage.put(cacheKey, new Response(url))
      return url;
    }
  }

  const downloadAttachment = async (attachment: EncryptedAttachmentDTO, useCache = true) => {
    try {
      let url = '';
      if ((isIOS() && process.env.NEXT_PUBLIC_OPTIONAL_CONVERT_PDF_SERVERSIDE) || process.env.NEXT_PUBLIC_CONVERT_PDF_SERVERSIDE) {

        const tempKey = await temporaryServerEncryptionKey(dbContextRef.current!, saasContext);

        console.log('Downloading attachment with server-side decryption');
        url =  '/enclave/download/' + attachment.storageKey + '?encr=' + encodeURIComponent(tempKey.encryptedKey) + '&klh=' + encodeURIComponent(tempKey.keyLocatorHash) + '&kh=' + encodeURIComponent(tempKey.keyHash) + '&dbid=' + encodeURIComponent(dbContextRef.current?.databaseHashId || '');
      } else {
        url = await getAttachmentData(attachment, AttachmentFormat.blobUrl, useCache) as string;
      }
      
      // Create a temporary anchor element and click it (works better on iOS Safari)
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.displayName || 'attachment';
      link.target = '_blank';
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      toast.error('Error downloading attachment ' + error);
    }
  };

  const calcChecksum = async (record: Record): Promise<string> => {
    const attachmentsHash = await sha256(record.attachments.map(ea => ea.storageKey).join('-'), 'attachments')
    const cacheKey = `record-${record.id}-${attachmentsHash}-${dbContextRef.current?.databaseHashId}`;

    return cacheKey;
  }

  const convertAttachmentsToImages = async (record: Record, statusUpdates: boolean = true): Promise<DisplayableDataObject[]> => {

    if (!record.attachments || record.attachments.length == 0) return [];

    const attachments = []
    const cacheStorage = await cache();
    const cacheKey = await calcChecksum(record);
    const cachedAttachments = await cacheStorage.match(cacheKey);

    if (cachedAttachments) {
      const deserializedAttachments = await cachedAttachments.json() as DisplayableDataObject[];
      console.log(`Attachment images loaded from cache for ${record.id} - pages: ` + deserializedAttachments.length + ' (' + cacheKey + ')');
      return deserializedAttachments;
    }

    for (const ea of record.attachments) {

      try {
        if (ea.mimeType === 'application/pdf') {

          let imagesArray: string[] = [];
          if ((isIOS() && (process.env.NEXT_PUBLIC_OPTIONAL_CONVERT_PDF_SERVERSIDE)) || process.env.NEXT_PUBLIC_CONVERT_PDF_SERVERSIDE) {
            console.log('Converting PDF to images server-side');
            const apiClient = new PdfConversionApiClient('', dbContext, saasContext);
            const result = await apiClient.convertPdf({
              temporaryServerKey: await temporaryServerEncryptionKey(dbContextRef.current!, saasContext),
              storageKey: ea.storageKey,
              conversion_config: { image_format: 'image/jpeg', height: (process.env.NEXT_PUBLIC_PDF_MAX_HEIGHT ? parseFloat(process.env.NEXT_PUBLIC_PDF_MAX_HEIGHT) : 3200)   /*, scale: process.env.NEXT_PUBLIC_PDF_SCALE ? parseFloat(process.env.NEXT_PUBLIC_PDF_SCALE) : 0.9 }*/ }
            });
            imagesArray = result.images;

          } else {

            if (statusUpdates) toast.info('Downloading file ' + ea.displayName);

            const pdfBase64Content = await getAttachmentData(ea.toDTO(), AttachmentFormat.dataUrl) as string; // convert to images otherwise it's not supported by vercel ai sdk
            if (statusUpdates) toast.info('Converting file  ' + ea.displayName + ' to images ...');
            imagesArray = await convert(pdfBase64Content, { base64: true, image_format: 'image/jpeg', height: (process.env.NEXT_PUBLIC_PDF_MAX_HEIGHT ? parseFloat(process.env.NEXT_PUBLIC_PDF_MAX_HEIGHT) : 3200)   /*, scale: process.env.NEXT_PUBLIC_PDF_SCALE ? parseFloat(process.env.NEXT_PUBLIC_PDF_SCALE) : 0.9 }*/ }, { dbContext, saasContext })

          }

          if (statusUpdates) toast.info('File converted to ' + imagesArray.length + ' images');
          for (let i = 0; i < imagesArray.length; i++) {
            attachments.push({
              name: ea.displayName + ' page ' + (i + 1),
              contentType: 'image/jpeg',
              url: imagesArray[i]
            })
          }

        } else {
          attachments.push({
            name: ea.displayName,
            contentType: ea.mimeType,
            url: await getAttachmentData(ea.toDTO(), AttachmentFormat.dataUrl) as string
          })
        }
      } catch (error) {
        console.error(error);
        if (statusUpdates) toast.error('Error downloading attachment: ' + error);
      }
    }
    cacheStorage.put(cacheKey, new Response(JSON.stringify(attachments)));
    return attachments;
  }

  const extraToRecord = async (type: string, promptText: string, record: Record) => {

    chatContext.setChatOpen(true);
    chatContext.sendMessage({
      message: {
        role: 'user',
        createdAt: new Date(),
        content: promptText,
        type: MessageType.Parse // this will prevent from adding the whole context              
      },
      onResult: (resultMessage, result) => {
        if (result.finishReason !== 'error') {
          let recordEXTRA = record.extra || []
          recordEXTRA.find(p => p.type === type) ? recordEXTRA = recordEXTRA.map(p => p.type === type ? { ...p, value: result.text } : p) : recordEXTRA.push({ type: type, value: result.text })
          console.log(recordEXTRA);
          record = new Record({ ...record, extra: recordEXTRA });
          updateRecord(record);
        }
      }
    })
  }

  // Helper to get the operations API client with current dbContext
  const getOperationsApiClient = () => {
    return new OperationsApiClient('', dbContextRef.current, saasContext, { useEncryption: false });
  };

  // Shared helper to check for ongoing operations for a specific record
  const checkOngoingOperation = async (recordId: number, operationName?: string) => {
    const operationsApi = getOperationsApiClient();
    const opRes = await operationsApi.get({ recordId });
    
    if ('data' in opRes && Array.isArray(opRes.data) && opRes.data.length > 0) {
      const ongoingOp = opRes.data[0];
      
      // Check if operation is finished or errored - if so, don't consider it ongoing
      if (ongoingOp.operationFinished || ongoingOp.operationErrored) {
        console.log('Operation is finished or errored, not ongoing:', recordId, 'finished:', ongoingOp.operationFinished, 'errored:', ongoingOp.operationErrored);
        return {
          hasOngoingOperation: false,
          isDifferentSession: false,
          operation: ongoingOp,
          shouldResume: false
        };
      }
      
      // Check if operation is from a different session
      if (ongoingOp.operationLastStepSessionId && ongoingOp.operationLastStepSessionId !== dbContextRef.current?.authorizedSessionId) {
        const timeFromLastStep = new Date().getTime() - new Date(ongoingOp.operationLastStep || '').getTime();
        if (timeFromLastStep < 2 * 60 * 1000) {
          return {
            hasOngoingOperation: true,
            isDifferentSession: true,
            operation: ongoingOp,
            shouldResume: false
          };
        }
      } else {
        // Same session
        return {
          hasOngoingOperation: true,
          isDifferentSession: false,
          operation: ongoingOp,
          shouldResume: operationName ? ongoingOp.operationName === operationName : true
        };
      }
    }
    
    return {
      hasOngoingOperation: false,
      isDifferentSession: false,
      operation: null,
      shouldResume: false
    };
  };

  // Helper to create an operation lock
  const createOperationLock = async (recordId: number, operationName: string) => {
    const operationsApi = getOperationsApiClient();
    await operationsApi.create({
      id: undefined,
      recordId: recordId,
      operationId: `${operationName}-${recordId}`,
      operationName: operationName,
      operationProgress: 0,
      operationProgressOf: 0,
      operationPage: 0,
      operationPages: 0,
      operationMessage: null,
      operationTextDelta: null,
      operationPageDelta: null,
      operationRecordText: null,
      operationStartedOn: new Date().toISOString(),
      operationStartedOnUserAgent: navigator.userAgent,
      operationStartedOnSessionId: dbContextRef.current?.authorizedSessionId || null,
      operationLastStep: new Date().toISOString(),
      operationLastStepUserAgent: navigator.userAgent,
      operationLastStepSessionId: dbContextRef.current?.authorizedSessionId || null
    });
  };

  // Helper to finish an operation
  const finishOperation = async (recordId: number, operationName: string, error: any = null) => {
    const operationsApi = getOperationsApiClient();
    const operationId = `${operationName}-${recordId}`;
    const operationDTO = {
      id: undefined,
      recordId: recordId,
      operationId,
      operationName: operationName,
      operationProgress: 100,
      operationProgressOf: 100,
      operationPage: 0,
      operationPages: 0,
      operationMessage: error ? 'Operation failed' : 'Operation completed successfully',
      operationTextDelta: null,
      operationPageDelta: null,
      operationRecordText: null,
      operationStartedOn: new Date().toISOString(),
      operationStartedOnUserAgent: navigator.userAgent,
      operationStartedOnSessionId: dbContextRef.current?.authorizedSessionId || null,
      operationLastStep: new Date().toISOString(),
      operationLastStepUserAgent: navigator.userAgent,
      operationLastStepSessionId: dbContextRef.current?.authorizedSessionId || null,
      operationFinished: !error,
      operationErrored: !!error,
      operationErrorMessage: error ? getErrorMessage(error) : null,
    };
    await operationsApi.update(operationDTO);
    console.log('Operation finished:', recordId, operationName, 'error:', !!error);
  };

  // Helper to send operation progress update (fire-and-forget)
  const sendOperationProgressUpdate = (record: Record, operation: string, progress: number, progressOf: number, page: number, pages: number, metadata: any, finished = false, errored = false, errorMessage: string | null = null) => {
    if (typeof record.id !== 'number') return;
    
    try {
      const operationsApi = getOperationsApiClient();
      const operationId = `${operation}-${record.id}`;
      const operationDTO = {
        id: undefined,
        recordId: record.id,
        operationId,
        operationName: operation,
        operationProgress: Math.round(progress),
        operationProgressOf: Math.round(progressOf),
        operationPage: page,
        operationPages: pages,
        operationMessage: metadata?.message || null,
        operationTextDelta: metadata?.textDelta || null,
        operationPageDelta: metadata?.pageDelta || null,
        operationRecordText: metadata?.recordText || null,
        operationStartedOn: new Date().toISOString(),
        operationStartedOnUserAgent: navigator.userAgent,
        operationStartedOnSessionId: dbContextRef.current?.authorizedSessionId || null,
        operationLastStep: new Date().toISOString(),
        operationLastStepUserAgent: navigator.userAgent,
        operationLastStepSessionId: dbContextRef.current?.authorizedSessionId || null,
        operationFinished: finished,
        operationErrored: errored,
        operationErrorMessage: errorMessage,
      };
      operationsApi.update(operationDTO); // fire-and-forget
    } catch (error) {
      console.error('Error sending operation progress update:', error);
    }
  };

  // Helper to update operation progress state
  const updateOperationProgressState = (record: Record, operation: string, progress: number, progressOf: number, page: number, pages: number, metadata: any) => {
    setOperationProgressByRecordId(prev => {
      const id = record.id?.toString() || 'unknown';
      const prevHistory = prev[id]?.history || [];
      return {
        ...prev,
        [id]: {
          operationName: operation,
          progress,
          progressOf,
          page,
          pages,
          message: metadata?.message,
          processedOnDifferentDevice: metadata?.processedOnDifferentDevice || false,
          metadata,
          textDelta: (prev[id]?.textDelta || '') + (metadata?.textDelta || ''),
          pageDelta: metadata?.pageDelta || '',
          recordText: metadata?.recordText || '',
          history: [
            ...prevHistory,
            { operationName: operation, progress, progressOf, metadata, page, pages, processedOnDifferentDevice: metadata?.processedOnDifferentDevice || false, message: metadata?.message, textDelta: metadata?.textDelta || '', pageDelta: metadata?.pageDelta || '', recordText: metadata?.recordText || '', timestamp: Date.now() }
          ]
        }
      };
    });
  };

  const updateOperationProgress = async (record: Record, operation: string, inProgress: boolean, progress: number = 0, progressOf: number = 0, page: number = 0, pages: number = 0, metadata: any = null, error: any = null): Promise<Record> => {
    record.operationName = operation;

    if (inProgress !== record.operationInProgress || error !== record.operationError) {
      record.operationInProgress = inProgress;
      // Update operation progress state when inProgress changes
      updateOperationProgressState(record, operation, progress, progressOf, page, pages, metadata);

      setRecords(prevRecords => {
        const updated = prevRecords.map(pr => pr.id === record.id ? record : pr);
        // Mark operation as finished when inProgress is false (operation complete)
        const isFinished = !inProgress && !error;
        sendOperationProgressUpdate(record, operation, progress, progressOf, page, pages, metadata, isFinished, error !== null, error ? getErrorMessage(error) : null);
        return updated;
      });
    }

    record.operationError = error;

    if (progress > 0 && progressOf > 0) {
      const lastStep = await getRecordExtra(record, 'Parse process last step');
      record = await setRecordExtra(record, 'Parse process last step', new Date().toISOString(), (new Date().getTime() - new Date(lastStep as string).getTime()) > 30 * 60 * 1000); // save progress every 30s

      record.operationProgress = {
        operationName: operation,
        page: page,
        pages: pages,
        progress: progress,
        progressOf: progressOf,
        textDelta: metadata?.textDelta,
        pageDelta: metadata?.pageDelta,
        recordText: metadata?.recordText,
        message: metadata?.message,
        processedOnDifferentDevice: metadata?.processedOnDifferentDevice || false
      }

      if (metadata && metadata.pageDelta && metadata.recordText) { // new page parsed
        record.text = metadata.recordText;
        record = await setRecordExtra(record, 'Page ' + page.toString() + ' content', metadata.pageDelta, false); // update the record parse progress

        if (progress >= (progressOf - 1)) {
          removeRecordExtra(record, 'Document parsed pages', false);
        } else {
          record = await setRecordExtra(record, 'Document parsed pages', page.toString(), false); // update the record parse progress
          record = await setRecordExtra(record, 'Document pages total', pages.toString(), false); // update the record parse progress
        }

        record = await updateRecord(record);
        // Only mark as finished if this is the last page and operation is complete
        const isLastPage = progress === (progressOf - 1);
        sendOperationProgressUpdate(record, operation, progress, progressOf, page, pages, metadata, isLastPage && !inProgress, false, null);
      }
      // Fire every 30 tokens in between
      if (progress % 30 === 0) {
        sendOperationProgressUpdate(record, operation, progress, progressOf, page, pages, metadata, false, false, null);
      }
    }

    if (progress > 0 && progressOf > 0 || error !== null || metadata?.message) {
      // Update operation progress state
      updateOperationProgressState(record, operation, progress, progressOf, page, pages, metadata);
    }

    return record;
  }

  const processParseQueue = async () => {
    if (parseQueueInProgress) {
      for (const pr of parseQueue) {
        await updateOperationProgress(pr, RegisteredOperations.Parse, true);
      }
      console.log('Parse queue in progress');
      return;
    }

    let currentRecord = null;
    parseQueueInProgress = true;
    while (parseQueue.length > 0) {
      try {
        currentRecord = parseQueue[0] as Record;

        console.log('Processing record: ', currentRecord, parseQueue.length);
        await updateOperationProgress(currentRecord, RegisteredOperations.Parse, true);

        setOperationStatus(DataLoadingStatus.Loading);
        const attachments = await convertAttachmentsToImages(currentRecord);
        setOperationStatus(DataLoadingStatus.Success);

        // Parsing is two or three stage operation: 1. OCR, 2. <optional> sensitive data removal, 3. LLM
        const ocrProvider = await config?.getServerConfig('ocrProvider') || 'llm-aged'; // default LLM provider
        console.log('Using OCR provider:', ocrProvider);

        let updatedRecord: Record | null = null;
        try {
          if (ocrProvider === 'chatgpt') {
            updatedRecord = await chatgptParseRecord(currentRecord, chatContext, config, folderContext, updateRecordFromText, updateOperationProgress, attachments);
          } else if (ocrProvider === 'tesseract') {
            updatedRecord = await tesseractParseRecord(currentRecord, chatContext, config, folderContext, updateRecordFromText, updateOperationProgress, attachments);
          } else if (ocrProvider === 'gemini') {
            updatedRecord = await geminiParseRecord(currentRecord, chatContext, config, folderContext, updateRecordFromText, updateOperationProgress, attachments);
          } else if (ocrProvider === 'llm-paged') {
            updatedRecord = await chatgptPagedParseRecord(currentRecord, chatContext, config, folderContext, updateRecordFromText, updateOperationProgress, attachments);
          } else {
            toast.error('Unknown OCR provider: ' + ocrProvider);
            updatedRecord = null;
          }

          // Execute post-parse callback if exists
          if (updatedRecord && currentRecord.postParseCallback) {
            await currentRecord.postParseCallback(updatedRecord);
          }
          
          // Check if auto-translation should be triggered for this record
          if (currentRecord && autoTranslateAfterParse.has(currentRecord.id!)) {
            console.log('Auto-translate triggered after parse for record:', currentRecord.id);
            try {
              await translateRecord(updatedRecord || currentRecord);
              console.log('Auto-translate completed for record:', currentRecord.id);
            } catch (error) {
              console.error('Error auto-translating after parse for record:', currentRecord.id, error);
            }
            autoTranslateAfterParse.delete(currentRecord.id!);
          }
          
          // Explicitly finish the operation successfully
          if (currentRecord) {
            await finishOperation(currentRecord.id!, RegisteredOperations.Parse);
          }
        } catch (error) {
          console.error('Error processing record:', error);
          toast.error('Error processing record: ' + error);
          if (currentRecord) {
            await updateOperationProgress(currentRecord, RegisteredOperations.Parse, false, 0, 0, 0, 0, null, error);
            // Explicitly finish the operation with error
            await finishOperation(currentRecord.id!, RegisteredOperations.Parse, error);
          }
        }

        console.log('Record parsed, taking next record', currentRecord);
        parseQueue = parseQueue.slice(1); // remove one item
        parseQueueLength = parseQueue.length;
      } catch (error) {
        parseQueue = parseQueue.slice(1); // remove one item
        parseQueueLength = parseQueue.length;

        if (currentRecord) {
          await updateOperationProgress(currentRecord, RegisteredOperations.Parse, false, 0, 0, 0, 0, null, error);
          // Explicitly finish the operation with error
          await finishOperation(currentRecord.id!, RegisteredOperations.Parse, error);
        }
      }
    }
    parseQueueInProgress = false;
  }

  const parseRecord = async (newRecord: Record, postParseCallback?: PostParseCallback) => {
    if (typeof newRecord.id !== 'number') return;
    
    // Check if this is a user-uploaded record that should be parsed
    if (!isUserUploadedRecord(newRecord)) {
      console.log('Skipping parse for non-user-uploaded record:', newRecord.id);
      if (postParseCallback) {
        postParseCallback(newRecord);
      }
      return;
    }
    
    // Early check: if record already has json and no checksum mismatch, skip parsing
    const hasJson = newRecord.json && newRecord.json.length > 0;
    const checksumMatch = newRecord.checksum === newRecord.checksumLastParsed;
    
    if (hasJson && checksumMatch) {
      console.log('Record already parsed and up to date, skipping:', newRecord.id, 'checksum:', newRecord.checksum, 'checksumLastParsed:', newRecord.checksumLastParsed);
      if (postParseCallback) {
        postParseCallback(newRecord);
      }
      return;
    }
    
    console.log('Proceeding with parsing for record:', newRecord.id, 'hasJson:', hasJson, 'checksumMatch:', checksumMatch, 'checksum:', newRecord.checksum, 'checksumLastParsed:', newRecord.checksumLastParsed);
    
    // Use shared helper to check for ongoing operations
    const operationCheck = await checkOngoingOperation(newRecord.id, RegisteredOperations.Parse);
    
    if (operationCheck.hasOngoingOperation) {
      if (operationCheck.isDifferentSession) {
        // Operation is from different session, show message and return
        await updateOperationProgress(newRecord, RegisteredOperations.Parse, true, 0, 0, 0, 0, { 
          message: 'Parse process started on ' + operationCheck.operation?.operationStartedOnUserAgent + ' last data chunk received on ' + operationCheck.operation?.operationLastStep, 
          processedOnDifferentDevice: true 
        });
        return;
      } else if (operationCheck.shouldResume) {
        // Same session, operation can be resumed - continue to add to queue
        console.log('Resuming existing parse operation for record:', newRecord.id);
      }
    } else {
      // No ongoing operation, create a lock
      await createOperationLock(newRecord.id, RegisteredOperations.Parse);
    }
    
    if (!parseQueue.find(pr => pr.id === newRecord.id) && newRecord.attachments.length > 0) {
      if (postParseCallback) {
        newRecord.postParseCallback = postParseCallback;
      }
      parseQueue.push(newRecord)
      parseQueueLength = parseQueue.length
      console.log('Added to parse queue: ', parseQueue.length);
    }
    processParseQueue();
  }

  const sendAllRecordsToChat = async (customMessage: CreateMessageEx | null = null, providerName?: string, modelName?: string, onResult?: OnResultCallback) => {
    return new Promise((resolve, reject) => {
      // chatContext.setChatOpen(true);
      if (records.length > 0) {
        const msgs: CreateMessageEx[] = [{
          role: 'user' as Message['role'],
          //createdAt: new Date(),
          visibility: MessageVisibility.Hidden, // we don't show folder records context
          content: prompts.recordsToChat({ records, config }),
        }, ...records.map((record) => {
          return {
            role: 'user' as Message['role'],
            visibility: MessageVisibility.Hidden, // we don't show folder records context
            //createdAt: new Date(),
            content: prompts.recordIntoChatSimplified({ record })
          }
        }), {
          role: 'user',
          visibility: MessageVisibility.Visible, // we don't show folder records context
          //createdAt: new Date(),
          content: prompts.recordsToChatDone({ records, config }),
        }];

        if (customMessage) {
          msgs.push(customMessage);
        }

        const preUsage = new GPTTokens({
          model: 'gpt-4o',
          messages: msgs as GPTTokens["messages"]
        });

        console.log('Context msg tokens', preUsage.usedTokens, preUsage.usedUSD);
        chatContext.setRecordsLoaded(true);
        chatContext.sendMessages({
          messages: msgs, providerName, onResult: (resultMessage, result) => {
            console.log('All records sent to chat');
            if (onResult) onResult(resultMessage, result);
            if (result.finishReason !== 'error') {
              resolve(result);
            } else {
              reject(result);
            }
          }
        })
      }
    });
  }

  const importRecords = async (zipFileInput: ArrayBuffer) => {
    try {
      if (!folderContext?.currentFolder) {
        toast.error('No folder selected');
        return;
      }
      const zip = new JSZip();
      const zipFile = await zip.loadAsync(zipFileInput as ArrayBuffer);
      const recordsFile = zipFile.file('records.json');
      const recordsJSON = await recordsFile?.async('string');
      const recordsData = JSON.parse(recordsJSON as string);
      const records = recordsData.map((recordDTO: RecordDTO) => Record.fromDTO(recordDTO)) as Record[];
      console.log('Imported records: ', records);
      const encUtils = dbContext?.masterKey ? new EncryptionUtils(dbContext.masterKey as string) : null;
      const encFilter = dbContext?.masterKey ? new DTOEncryptionFilter(dbContext.masterKey as string) : null;

      let idx = 1;
      for (const record of records) {
        try {
          delete record.id; // new id is required
          toast.info('Importing record (' + idx + ' of ' + records.length + '): ' + record.title);
          record.folderId = folderContext?.currentFolder?.id ?? 1;
          const uploadedAttachments: EncryptedAttachmentDTO[] = [];

          if (record.attachments) {
            for (const attachment of record.attachments) {
              if (attachment.filePath) {
                const attachmentContent = await zipFile.file(attachment.filePath)?.async('arraybuffer');
                if (attachmentContent) {
                  const encryptedBuffer = await encUtils?.encryptArrayBuffer(attachmentContent as ArrayBuffer) as ArrayBuffer;
                  const encryptedFile = new File([encryptedBuffer], attachment.displayName, { type: attachment.mimeType });
                  const formData = new FormData();
                  formData.append("file", encryptedFile); // TODO: encrypt file here

                  let attachmentDTO: EncryptedAttachmentDTO = attachment.toDTO();
                  delete attachmentDTO.id;
                  delete attachmentDTO.filePath;

                  attachmentDTO = encFilter ? await encFilter.encrypt(attachmentDTO, EncryptedAttachmentDTOEncSettings) as EncryptedAttachmentDTO : attachmentDTO;
                  formData.append("attachmentDTO", JSON.stringify(attachmentDTO));
                  try {
                    const apiClient = new EncryptedAttachmentApiClient('', dbContext, saasContext, {
                      useEncryption: false  // for FormData we're encrypting records by ourselves - above
                    })
                    toast.info('Uploading attachment: ' + attachment.displayName);
                    const result = await apiClient.put(formData);
                    if (result.status === 200) {
                      const decryptedAttachmentDTO: EncryptedAttachmentDTO = (encFilter ? await encFilter.decrypt(result.data, EncryptedAttachmentDTOEncSettings) : result.data) as EncryptedAttachmentDTO;
                      console.log('Attachment saved', decryptedAttachmentDTO);
                      uploadedAttachments.push(decryptedAttachmentDTO);
                    }
                  } catch (error) {
                    console.error(error);
                    toast.error('Error saving attachment: ' + error);
                  }
                }
              }
            }
          }
          record.attachments = uploadedAttachments.map(ea => new EncryptedAttachment(ea));
          console.log('Importing record: ', record);
          const updatedRecord = await updateRecord(record);
        } catch (error) {
          console.error(error);
          toast.error('Error importing record: ' + error);
        }
        idx++;
      }
      toast.success('Records imported successfully!');
    } catch (error) {
      console.error(error);
      toast.error('Error importing records: ' + error);
    }
  }

  const exportRecords = async () => {
    // todo: download attachments

    const prepExportData = filteredRecords.map(record => record);
    toast.info('Exporting ' + prepExportData.length + ' records');

    const zip = new JSZip();
    const converter = new showdown.Converter({ tables: true, completeHTMLDocument: true, openLinksInNewWindow: true });
    converter.setFlavor('github');

    let indexMd = '# DoctorDok Export\n\n';

    toast.info('Downloading attachments ...');
    for (const record of prepExportData) {
      if (record.attachments) {
        const recordNiceName = filenamify(record.eventDate ? (record.eventDate + ' - ' + record.title) : (record.createdAt + (record.title ? ' - ' + record.title : '')), { replacement: '-' });
        const folder = zip.folder(recordNiceName)
        if (record.text) {
          folder?.file(filenamify(recordNiceName) + '.md', record.text);
          folder?.file(filenamify(recordNiceName) + '.html', converter.makeHtml(record.text));
          indexMd += `- <a href="${recordNiceName}/${filenamify(recordNiceName)}.md">${record.eventDate ? record.eventDate : record.createdAt} - ${record.title}</a>\n\n`;
        }

        for (const attachment of record.attachments) {
          try {
            const attFileName = filenamify(attachment.displayName.replace('.', '-' + attachment.id + '.'), { replacement: '-' });
            toast.info('Downloading attachment: ' + attachment.displayName);
            const attBlob = await getAttachmentData(attachment.toDTO(), AttachmentFormat.blob, true, (isIOS() && process.env.NEXT_PUBLIC_OPTIONAL_CONVERT_PDF_SERVERSIDE !== '') || process.env.NEXT_PUBLIC_CONVERT_PDF_SERVERSIDE !== '');
            if (folder) folder.file(attFileName, attBlob as Blob);

            attachment.filePath = recordNiceName + '/' + attFileName // modify for the export
            indexMd += ` - <a href="${recordNiceName}/${attFileName}">${attFileName}</a>\n\n`;

          } catch (e) {
            console.error(e);
            toast.error(getErrorMessage(e));
          }
        }
      }
    }
    try {
      const exportData = filteredRecords.map(record => record.toDTO());
      const exportBlob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
      zip.file('records.json', exportBlob);
      zip.file('index.md', indexMd);
      zip.file('index.html', converter.makeHtml(indexMd.replaceAll('.md', '.html')));

      toast.info('Creating ZIP archive ...');
      const exportFileName = 'DoctorDok-export' + filenamify(filterSelectedTags && filterSelectedTags.length ? '-' + filterSelectedTags.join('-') : '') + '.zip';
      const zipFileContent = await zip.generateAsync({ type: "blob" });

      toast.info('All records exported!')
      saveAs(zipFileContent, exportFileName);
    } catch (e) {
      console.error(e);
      toast.error(getErrorMessage(e));
    }
  }

  const sendRecordToChat = async (record: Record, forceRefresh: boolean = false) => {
    if (!record.json || forceRefresh) {  // first: parse the record
      // Only parse user-uploaded records
      if (isUserUploadedRecord(record)) {
        await parseRecord(record);
      } else {
        console.log('Skipping parse for non-user-uploaded record in chat:', record.id);
        // Still send to chat even if not parsed
        chatContext.setChatOpen(true);
        chatContext.sendMessage({
          message: {
            role: 'user',
            createdAt: new Date(),
            content: prompts.recordIntoChat({ record, config }),
          }
        });
      }
    } else {
      chatContext.setChatOpen(true);
      chatContext.sendMessage({
        message: {
          role: 'user',
          createdAt: new Date(),
          content: prompts.recordIntoChat({ record, config }),
        }
      });
    }
  }

  const removeRecordExtra = async (record: Record, type: string, autosaveRecord: boolean = true): Promise<Record> => {
    let recordEXTRA = record.extra || []
    recordEXTRA = recordEXTRA.filter(p => p.type !== type)
    record = new Record({ ...record, extra: recordEXTRA }) as Record;
    if (autosaveRecord) {
      return await updateRecord(record);
    }
    return record;
  }

  const setRecordExtra = async (record: Record, type: string, value: string, autosaveRecord: boolean = true): Promise<Record> => {
    let recordEXTRA = record.extra || []
    recordEXTRA.find(p => p.type === type) ? recordEXTRA = recordEXTRA.map(p => p.type === type ? { ...p, value } : p) : recordEXTRA.push({ type, value })
    record = new Record({ ...record, extra: recordEXTRA });
    if (autosaveRecord) {
      return await updateRecord(record);
    }
    return record;
  }

  const translateRecord = async (record: Record, language: string = 'English') => {
    // Check if this record is already being translated
    if (typeof record.id === 'number' && recordsBeingTranslated.has(record.id)) {
      console.log('Translation already in progress for record:', record.id, 'skipping');
      return record;
    }

    // Add record to the set of records being translated
    if (typeof record.id === 'number') {
      recordsBeingTranslated.add(record.id);
    }

    try {
      const parseAIProvider = await config?.getServerConfig('llmProviderParse') as string;
      const parseModelName = await config?.getServerConfig('llmModelParse') as string;

      // Gather all page contents from record.extra
      const pages: string[] = [];
      let pageNum = 1;
      while (true) {
        const pageContent = await getRecordExtra(record, 'Page ' + pageNum + ' content');
        if (!pageContent) break;
        pages.push(pageContent as string);
        pageNum++;
      }
      if (pages.length === 0 && record.text) {
        pages.push(record.text);
      }

      let translatedPages: string[] = [];
      let progress = 0;
      setOperationStatus(DataLoadingStatus.Loading);
      // --- Translation progress bar support ---
      record = await updateOperationProgress(record, RegisteredOperations.Translate, true, 0, pages.length, 0, pages.length, null, null);
      // Prepare a placeholder for the translated record (will be created after all pages are translated)
      let pagesTokensProcessed = 0;
      let totalPagesTokens = AVERAGE_PAGE_TOKENS * pages.length;

      for (let i = 0; i < pages.length; i++) {
        let translatedPage = '';
        const stream = chatContext.aiDirectCallStream([
          {
            id: nanoid(),
            role: 'user',
            createdAt: new Date(),
            content: prompts.translateRecordTextByPage({ record, language, page: i + 1, pageContent: pages[i] }),
          }
        ], undefined, parseAIProvider, parseModelName);
        let pageTokens = 0;
        for await (const delta of stream) {
          translatedPage += delta;
          pageTokens += 1;
          pagesTokensProcessed += 1;
          // Update translation progress UI here
          record = await updateOperationProgress(record, RegisteredOperations.Translate, true, pagesTokensProcessed, totalPagesTokens, i + 1, pages.length, { textDelta: delta }, null);
        }
        translatedPages.push(translatedPage);
        // Update after each page is finished

        totalPagesTokens -= AVERAGE_PAGE_TOKENS;
        totalPagesTokens += pageTokens * 1.7; // we estimate the metadata to be twice as long as the text for metadata
        record = await updateOperationProgress(record, RegisteredOperations.Translate, true, pagesTokensProcessed, totalPagesTokens, i + 1, pages.length, { pageDelta: translatedPage }, null);
      }
      // Join translated pages
      const translatedText = translatedPages.join('\n\n');

      // Generate metadata for the translated text
      let metaDataJson = '';
      const metadataStream = chatContext.aiDirectCallStream([
        {
          id: nanoid(),
          role: 'user',
          createdAt: new Date(),
          content: prompts.recordParseMetadata({ record, config, page: pages.length, recordContent: translatedText }),
        }
      ], undefined, parseAIProvider, parseModelName);

      for await (const delta of metadataStream) {
        metaDataJson += delta;
        pagesTokensProcessed += 1;
        // Update translation progress UI here
        record = await updateOperationProgress(record, RegisteredOperations.Translate, true, pagesTokensProcessed, totalPagesTokens, pages.length, pages.length, { textDelta: delta }, null);
      }
      metaDataJson = metaDataJson.replace(/```[a-zA-Z]*\n?|```/g, '');
      const fullTextToProcess = '```json\n' + metaDataJson + '\n```\n\n```markdown\n' + translatedText + '\n```';

      // Create a copy of the original record's attachments
      const attachmentsCopy = record.attachments.map(att => att.toDTO());
      let translatedRecord = await updateRecordFromText(fullTextToProcess, null, true, [
        { type: 'Reference record Ids', value: record.id?.toString() || '' },
        { type: 'Translation language', value: language },
        { type: 'Preserved attachments', value: attachmentsCopy.map(att => att.id).join(', ') }
      ]); // creates new record

      if (!translatedRecord) {
        setOperationStatus(DataLoadingStatus.Error);
        // End translation progress
        record = await updateOperationProgress(record, RegisteredOperations.Translate, false, pagesTokensProcessed, pagesTokensProcessed, pages.length, pages.length, null, 'Failed to create translated record');
        throw new Error('Failed to create translated record');
      }

      // Now that we have the translated record, set the extras for each page
      for (let i = 0; i < translatedPages.length; i++) {
        translatedRecord = await setRecordExtra(translatedRecord, `Page ${i + 1} content`, translatedPages[i], false);
      }

      // Update the translated record with the original attachments and eventDate
      translatedRecord.attachments = attachmentsCopy.map(dto => new EncryptedAttachment(dto));
      translatedRecord.eventDate = record.eventDate || record.createdAt;


      // Create a bi-directional reference by updating the original record
      const translationRefsKey = 'Reference record Ids';
      const existingTranslationRefs = record.extra?.find(e => e.type === translationRefsKey);
      if (existingTranslationRefs && typeof existingTranslationRefs.value === 'string') {
        // If there are existing translations, append the new one
        const existingIds = existingTranslationRefs.value.split(',').map(id => id.trim());
        if (!existingIds.includes(translatedRecord.id?.toString() || '')) {
          existingTranslationRefs.value = [...existingIds, translatedRecord.id?.toString() || ''].join(', ');
          record = await setRecordExtra(record, translationRefsKey, existingTranslationRefs.value as string, false);
        }
      } else {
        // If this is the first translation, create new reference
        record = await setRecordExtra(record, translationRefsKey, translatedRecord.id?.toString() || '', false);
      }

      record = await updateRecord(record); // save changes to original record
      translatedRecord = await updateRecord(translatedRecord); // save changes to translated record

      setOperationStatus(DataLoadingStatus.Success);
      // End translation progress
      await updateOperationProgress(record, RegisteredOperations.Translate, false, pagesTokensProcessed, pagesTokensProcessed, pages.length, pages.length, null, null);
      return translatedRecord;

    } catch (error) {
      setOperationStatus(DataLoadingStatus.Error);
      // End translation progress with error
      await updateOperationProgress(record, RegisteredOperations.Translate, false, 0, 0, 0, 0, null, error);
      console.error('Error translating record:', error);
      toast.error('Error translating record: ' + error);
      throw error;
    } finally {
      // Always remove the record from the set of records being translated
      if (typeof record.id === 'number') {
        recordsBeingTranslated.delete(record.id);
      }
    }
  }

  // Helper to check if records need refreshing
  const checkAndRefreshRecords = async (forFolder: Folder, forceRefresh: boolean = false) => {
    try {
      const client = await setupApiClient(config);
      if (!forFolder.id) return;
      
      // If forceRefresh is true, skip all checks and just refresh
      if (forceRefresh) {
        console.log('Manual refresh requested, refreshing records');
        await listRecords(forFolder);
        return new Date().toISOString();
      }
      
      const lastUpdateResponse = await client.getLastUpdateDate(forFolder.id);
      
      if (lastUpdateResponse.status === 200 && 'data' in lastUpdateResponse) {
        const serverLastUpdate = lastUpdateResponse.data.lastUpdateDate;
        
        // Check if server data is newer than our last refresh
        if (!lastRefreshed || (serverLastUpdate && new Date(serverLastUpdate) > lastRefreshed)) {
          console.log('Server data is newer, refreshing records');
          
          // Get record IDs that need updating:
          // 1. Records with operations in progress
          // 2. Visible records
          // 3. Records newer than last refresh
          const recordIdsToUpdate = new Set<number>();
          
          // Add records with operations in progress
          Object.keys(operationProgressByRecordId).forEach(recordIdStr => {
            const recordId = parseInt(recordIdStr);
            if (!isNaN(recordId)) {
              recordIdsToUpdate.add(recordId);
            }
          });
          
          // Add visible records
          Array.from(visibleRecordIds).forEach(recordId => {
            recordIdsToUpdate.add(recordId);
          });
          
          const recordIdsArray = Array.from(recordIdsToUpdate);
          const newerThan = lastRefreshed ? lastRefreshed.toISOString() : undefined;
          
          // Use partial update if we have specific records to update
          if (recordIdsArray.length > 0 || newerThan) {
            console.log('Using partial update for', recordIdsArray.length, 'records and newer than', newerThan);
            await listRecordsPartial(forFolder, recordIdsArray.length > 0 ? recordIdsArray : undefined, newerThan, lastUpdateResponse.data.recordId || 0, false);
          } else {
            // Fall back to full refresh if no specific records to update
            await listRecords(forFolder);
          }
          
          return serverLastUpdate;
        }
        
        // If server data hasn't changed, check for finished/errored operations for all records
        const operationsApi = getOperationsApiClient();
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        
        // Get all records that are currently showing operation progress in the UI
        const recordIdsWithProgress = Object.keys(operationProgressByRecordId).map(id => parseInt(id)).filter(id => !isNaN(id));
        
        if (recordIdsWithProgress.length > 0) {
          // Fetch operations for all records showing progress
          const operationsResponse = await operationsApi.get({ recordIds: recordIdsWithProgress });
          
          if ('data' in operationsResponse && Array.isArray(operationsResponse.data)) {
            const recentFinishedOperations = clearFinishedOperations(operationsResponse.data);
            
            if (recentFinishedOperations.length > 0) {
              console.log('Found recently finished operations, refreshing records');
              
              // Use partial update for records with finished operations
              const finishedRecordIds = recentFinishedOperations.map(op => op.recordId);
              await listRecordsPartial(forFolder, finishedRecordIds, undefined, undefined, false);
              return recentFinishedOperations[0].operationLastStep;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  };

  // Helper function to calculate safe interval based on execution time
  const calculateSafeInterval = (hasOperationsInProgress: boolean): number => {
    // Calculate safe interval based on execution time
    const minIntervalMs = Math.max(2000, lastListRecordsExecutionTimeRef.current * 5); // At least 10s, or 5x execution time
    return hasOperationsInProgress ? minIntervalMs : Math.max(20000, minIntervalMs); // 20s minimum when idle, or execution time based
  };

  // Shared helper to set up auto-refresh interval
  const setupAutoRefreshInterval = (forFolder: Folder, forceRestart: boolean = false) => {
    // Clear existing interval if forceRestart is true or if interval exists
    if (forceRestart || refreshIntervalRef.current) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        console.log('Cleared existing auto-refresh interval');
      }
    } else if (refreshIntervalRef.current) {
      // If not forcing restart and interval exists, don't modify it
      return;
    }
    
    // Check if there are any operations in progress - use ref for current value
    const hasOperationsInProgress = Object.keys(operationProgressByRecordId).length > 0;
    
    // Calculate safe interval based on execution time
    const intervalMs = calculateSafeInterval(hasOperationsInProgress);
    
    console.log(`Starting auto-refresh interval with ${intervalMs}ms (operations in progress: ${hasOperationsInProgress}, execution time: ${lastListRecordsExecutionTimeRef.current}ms)`);
    
    // Set new interval
    refreshIntervalRef.current = setInterval(async () => {
      console.log('Auto-refresh interval triggered, checking for updates...');
      await checkAndRefreshRecords(forFolder);
    }, intervalMs);
  };

  // Start auto-refresh interval
  const startAutoRefresh = (forFolder: Folder) => {
    console.log('startAutoRefresh called for folder:', forFolder.id);
    setupAutoRefreshInterval(forFolder, true);
  };

  // Update auto-refresh interval based on operation status
  const updateAutoRefreshInterval = (forFolder: Folder) => {
    if (!refreshIntervalRef.current) return; // No interval running
    setupAutoRefreshInterval(forFolder, true);
  };

  // Stop auto-refresh interval
  const stopAutoRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      stopAutoRefresh();
    };
  }, []);

  // Update auto-refresh interval when operation progress changes
  useEffect(() => {
    if (refreshIntervalRef.current && folderContext?.currentFolder) {
      updateAutoRefreshInterval(folderContext.currentFolder);
    }
  }, [operationProgressByRecordId]);


  useEffect(() => {
    dbContextRef.current = dbContext;
  }, [dbContext]);

  const addVisibleRecordId = (recordId: number) => {
    setVisibleRecordIds(prev => new Set(Array.from(prev).concat([recordId])));
  };

  const removeVisibleRecordId = (recordId: number) => {
    setVisibleRecordIds(prev => {
      const newSet = new Set(Array.from(prev));
      newSet.delete(recordId);
      return newSet;
    });
  };

  return (
    <RecordContext.Provider
      value={{
        records,
        filteredRecords,
        parseQueueLength,
        updateRecordFromText,
        updateRecord,
        loaderStatus,
        operationStatus,
        setOperationStatus,
        setCurrentRecord,
        currentRecord,
        listRecords,
        listRecordsPartial,
        checkAndRefreshRecords,
        startAutoRefresh,
        stopAutoRefresh,
        lastRefreshed,
        deleteRecord,
        recordEditMode,
        setRecordEditMode,
        getAttachmentData,
        downloadAttachment,
        convertAttachmentsToImages,
        extraToRecord,
        parseRecord,
        sendRecordToChat,
        sendAllRecordsToChat,
        processParseQueue,
        filterAvailableTags,
        filterSelectedTags,
        setFilterSelectedTags,
        filterToggleTag,
        filtersOpen,
        setFiltersOpen,
        sortBy,
        setSortBy,
        getTagsTimeline,
        exportRecords,
        importRecords,
        recordDialogOpen,
        setRecordDialogOpen,
        setRecordExtra,
        removeRecordExtra,
        translateRecord,
        operationProgressByRecordId,
        parsingDialogOpen,
        setParsingDialogOpen,
        parsingDialogRecordId,
        setParsingDialogRecordId,
        visibleRecordIds,
        addVisibleRecordId,
        removeVisibleRecordId
      }}
    >
      {children}
    </RecordContext.Provider>
  );
};

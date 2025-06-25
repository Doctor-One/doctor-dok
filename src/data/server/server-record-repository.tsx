import { BaseRepository, IQuery } from "./base-repository"
import { RecordDTO } from "../dto";
import { pool } from '@/data/server/db-provider'
import { getCurrentTS } from "@/lib/utils";
import { records } from "./db-schema";
import { eq, sql, isNotNull, and } from "drizzle-orm";
import { create } from "./generic-repository";
import { desc, asc } from 'drizzle-orm';
import { operations } from "./db-schema-operations";
import ServerOperationsRepository from "./server-operations-repository";

export default class ServerRecordRepository extends BaseRepository<RecordDTO> {
    
    
    async create(item: RecordDTO): Promise<RecordDTO> {
        const db = (await this.db());
        return create(item, records, db); // generic implementation
    }

    // update folder
    async upsert(query:Record<string, any>, item: RecordDTO): Promise<RecordDTO> { 
        const db = (await this.db());       
        let existingRecord:RecordDTO | null = query.id ? db.select().from(records).where(eq(records.id, query.id)).get() as RecordDTO : null
        if (!existingRecord) {
            existingRecord = await this.create(item);
       } else {
            existingRecord = item
            existingRecord.updatedAt = getCurrentTS() // TODO: load attachments
            db.update(records).set(existingRecord).where(eq(records.id, query.id)).run();
       }
       return Promise.resolve(existingRecord as RecordDTO)   
    }    

    async delete(query: Record<string, string>): Promise<boolean> {
        const db = (await this.db());
        return db.delete(records).where(eq(records.id, parseInt(query.id))).run().changes > 0
    }

    async findAll(query?: IQuery): Promise<RecordDTO[]> {
        const db = (await this.db());
        let dbQuery = db.select().from(records);
        if(query?.filter){
            if(query.filter['folderId']){
                dbQuery.where(eq(records.folderId, parseInt(query.filter['folderId'] as string)));
            }
        }
        return Promise.resolve(dbQuery.all() as RecordDTO[])
    }

    async getLastUpdateDate(folderId: number): Promise<{ recordId: number; updatedAt: string } | null> {
        const db = (await this.db());
        
        // Get the latest record update date
        const latestRecordUpdate = db.select({ id: records.id, updatedAt: records.updatedAt })
            .from(records)
            .where(eq(records.folderId, folderId))
            .orderBy(desc(records.updatedAt))
            .limit(1)
            .get() as { id: number; updatedAt: string } | undefined;
        
        // Get the latest operation last step date for records in this folder
        const operationsRepo = new ServerOperationsRepository(this.databaseId, 'operations', 'operations');
        
        // First get all record IDs in this folder
        const folderRecords = db.select({ id: records.id })
            .from(records)
            .where(eq(records.folderId, folderId))
            .all() as { id: number }[];
        
        const recordIds = folderRecords.map(r => r.id);
        
        let latestOperationUpdate: { recordId: number; operationLastStep: string } | undefined;
        
        if (recordIds.length > 0) {
            // Get operations for all records in this folder
            const operations = await operationsRepo.findAll({ 
                filter: { recordIds: recordIds } 
            });
            
            // Find the operation with the latest operationLastStep
            const operationsWithLastStep = operations.filter(op => op.operationLastStep);
            if (operationsWithLastStep.length > 0) {
                const latestOperation = operationsWithLastStep.reduce((latest, current) => {
                    const latestDate = new Date(latest.operationLastStep || '');
                    const currentDate = new Date(current.operationLastStep || '');
                    return currentDate > latestDate ? current : latest;
                });
                
                latestOperationUpdate = {
                    recordId: latestOperation.recordId,
                    operationLastStep: latestOperation.operationLastStep!
                };
            }
        }
        
        // Compare dates and return the latest
        if (latestRecordUpdate && latestOperationUpdate) {
            const recordDate = new Date(latestRecordUpdate.updatedAt);
            const operationDate = new Date(latestOperationUpdate.operationLastStep);
            
            if (operationDate > recordDate) {
                return { 
                    recordId: latestOperationUpdate.recordId, 
                    updatedAt: latestOperationUpdate.operationLastStep 
                };
            } else {
                return { 
                    recordId: latestRecordUpdate.id, 
                    updatedAt: latestRecordUpdate.updatedAt 
                };
            }
        } else if (latestRecordUpdate) {
            return { 
                recordId: latestRecordUpdate.id, 
                updatedAt: latestRecordUpdate.updatedAt 
            };
        } else if (latestOperationUpdate) {
            return { 
                recordId: latestOperationUpdate.recordId, 
                updatedAt: latestOperationUpdate.operationLastStep 
            };
        }
        
        return null;
    }
}
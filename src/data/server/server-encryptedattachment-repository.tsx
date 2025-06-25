import { BaseRepository } from "./base-repository"
import { EncryptedAttachmentDTO } from "../dto";
import { pool } from '@/data/server/db-provider'
import { getCurrentTS } from "@/lib/utils";
import { encryptedAttachments } from "./db-schema";
import { eq } from "drizzle-orm";
import { create } from "./generic-repository";

export default class ServerEncryptedAttachmentRepository extends BaseRepository<EncryptedAttachmentDTO> {
    
    
    async create(item: EncryptedAttachmentDTO): Promise<EncryptedAttachmentDTO> {
        const db = (await this.db());
        return create(item, encryptedAttachments, db); // generic implementation
    }

    async delete(query:Record<string, any>): Promise<boolean> {
        const db = (await this.db());
        return db.delete(encryptedAttachments).where(eq(encryptedAttachments.storageKey, query.storageKey)).run().changes > 0
    }

    // update folder
    async upsert(query:Record<string, any>, item: EncryptedAttachmentDTO): Promise<EncryptedAttachmentDTO> {        
        const db = (await this.db());
        let existingRecord:EncryptedAttachmentDTO | null = query.id ? db.select().from(encryptedAttachments).where(eq(encryptedAttachments.id, query.id)).get() as EncryptedAttachmentDTO : null
        if (!existingRecord) {
            existingRecord = await this.create(item);
       } else {
            existingRecord = item
            existingRecord.updatedAt = getCurrentTS() // TODO: load attachments
            db.update(encryptedAttachments).set(existingRecord).where(eq(encryptedAttachments.id, query.id)).run();
       }
       return Promise.resolve(existingRecord as EncryptedAttachmentDTO)   
    }    

    async findAll(query?: IQuery): Promise<EncryptedAttachmentDTO[]> {
        const db = (await this.db());
        let dbQuery = db.select().from(encryptedAttachments);
        if(query?.filter){
            if(query.filter['storageKey']){
                dbQuery.where(eq(encryptedAttachments.storageKey, query.filter['storageKey'] as string));
            }
            if(query.filter['id']){
                dbQuery.where(eq(encryptedAttachments.id, parseInt(query.filter['id'] as string)));
            }

        }
        return Promise.resolve(dbQuery.all() as EncryptedAttachmentDTO[])
    }

}
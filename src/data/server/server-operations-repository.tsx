import { BaseRepository, IQuery } from "./base-repository";
import { OperationDTO } from "../dto";
import { operations } from "./db-schema-operations";
import { eq, desc, inArray } from "drizzle-orm";
import { create } from "./generic-repository";

export default class ServerOperationsRepository extends BaseRepository<OperationDTO> {
    async create(item: OperationDTO): Promise<OperationDTO> {
        const db = (await this.db());
        return create(item, operations, db); // generic implementation
    }

    async upsert(query: Record<string, any>, item: OperationDTO): Promise<OperationDTO> {
        const db = (await this.db());
        let existingOperation: OperationDTO | null = null;
        if (query.id !== undefined) {
            existingOperation = db.select().from(operations).where(eq(operations.id, Number(query.id))).get() as OperationDTO;
        } else if (query.recordId !== undefined) {
            existingOperation = db.select().from(operations).where(eq(operations.recordId, Number(query.recordId))).get() as OperationDTO;
        } else if (query.operationId !== undefined) {
            existingOperation = db.select().from(operations).where(eq(operations.operationId, String(query.operationId))).get() as OperationDTO;
        }
        if (!existingOperation) {
            existingOperation = await this.create(item);
        } else {
            // update all fields from item
            Object.assign(existingOperation, item);
            db.update(operations).set(existingOperation).where(eq(operations.id, Number(existingOperation.id))).run();
        }
        return Promise.resolve(existingOperation as OperationDTO);
    }

    async delete(query: Record<string, any>): Promise<boolean> {
        const db = (await this.db());
        if (query.id !== undefined) {
            return db.delete(operations).where(eq(operations.id, Number(query.id))).run().changes > 0;
        } else if (query.recordId !== undefined) {
            return db.delete(operations).where(eq(operations.recordId, Number(query.recordId))).run().changes > 0;
        } else if (query.operationId !== undefined) {
            return db.delete(operations).where(eq(operations.operationId, String(query.operationId))).run().changes > 0;
        }
        return false;
    }

    async findAll(query?: IQuery): Promise<OperationDTO[]> {
        const db = (await this.db());
        let dbQuery = db.select().from(operations);
        if (query?.filter) {
            if (query.filter.id !== undefined) {
                dbQuery.where(eq(operations.id, Number(query.filter.id)));
            } else if (query.filter.recordId !== undefined) {
                dbQuery.where(eq(operations.recordId, Number(query.filter.recordId)));
            } else if (query.filter.recordIds !== undefined && Array.isArray(query.filter.recordIds)) {
                dbQuery.where(inArray(operations.recordId, query.filter.recordIds.map((id: string) => Number(id))));
            } else if (query.filter.operationId !== undefined) {
                dbQuery.where(eq(operations.operationId, String(query.filter.operationId)));
            }
        }
        dbQuery.orderBy(desc(operations.operationLastStep));
        return Promise.resolve(dbQuery.all() as OperationDTO[]);
    }

    async findOne(query: Record<string, any>): Promise<OperationDTO | null> {
        const results = await this.findAll({ filter: query });
        return results.length > 0 ? results[0] : null;
    }
} 
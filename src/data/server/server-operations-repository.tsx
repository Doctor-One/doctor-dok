import { BaseRepository, IQuery } from "./base-repository";
import { OperationDTO } from "../dto";
import { operations } from "./db-schema-operations";
import { eq, desc, inArray, and } from "drizzle-orm";
import { create } from "./generic-repository";

export default class ServerOperationsRepository extends BaseRepository<OperationDTO> {
    async create(item: OperationDTO): Promise<OperationDTO> {
        const db = await this.db();

        // Enforce single operation row per recordId (acts as a lock)
        if (item.recordId !== undefined && item.recordId !== null) {
            const existing = db
                .select()
                .from(operations)
                .where(and(eq(operations.recordId, Number(item.recordId)), eq(operations.operationName, item.operationName)))
                .get() as OperationDTO | undefined;

            if (existing) {
                const updated = { ...existing, ...item } as OperationDTO;
                db.update(operations)
                    .set(updated)
                    .where(eq(operations.id, Number(existing.id)))
                    .run();
                return Promise.resolve(updated);
            }
        }

        // No existing operation for this record – insert new row
        return create(item, operations, db);
    }

    async upsert(query: Record<string, any>, item: OperationDTO): Promise<OperationDTO> {
        const db = (await this.db());
        let existingOperation: OperationDTO | null = null;
        if (query.id !== undefined) {
            existingOperation = db.select().from(operations).where(eq(operations.id, Number(query.id))).get() as OperationDTO;
        } else if (query.recordId !== undefined) {
            console.log('upsert', query);
            if (query.operationName !== undefined) {
                existingOperation = db.select().from(operations).where(and(eq(operations.recordId, Number(query.recordId)), eq(operations.operationName, query.operationName))).get() as OperationDTO;
            } else {
                existingOperation = db.select().from(operations).where(eq(operations.recordId, Number(query.recordId))).get() as OperationDTO;
            }
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
                if (query.filter.operationName !== undefined) {
                    dbQuery.where(and(eq(operations.recordId, Number(query.filter.recordId)), eq(operations.operationName, query.filter.operationName)));
                } else {
                    dbQuery.where(eq(operations.recordId, Number(query.filter.recordId)));
                }
            } else if (query.filter.recordIds !== undefined && Array.isArray(query.filter.recordIds)) {
                dbQuery.where(inArray(operations.recordId, query.filter.recordIds.map((id: string) => Number(id)))).orderBy(desc(operations.operationId));
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
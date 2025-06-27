import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const folders = sqliteTable('folders', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    name: text('name'),
    json: text('json', { mode: 'json' }),
    updatedAt: text('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP`)
});


export const config = sqliteTable('config', {
    key: text('key', { mode: 'text' }).primaryKey(),
    value: text('value'),
    updatedAt: text('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const keys = sqliteTable('keys', {
    keyLocatorHash: text('keyLocatorHash').primaryKey(),
    displayName: text('displayName'),
    databaseIdHash: text('databaseIdHash', { mode: 'text' }).notNull(),
    keyHash: text('keyHash').notNull(),
    keyHashParams: text('keyHashParams').notNull(),
    encryptedMasterKey: text('encryptedMasterKey').notNull(),
    acl: text('acl'),
    extra: text('extra'),
    expiryDate: text('expiryDate').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP`),
    zone: text('zone', { mode: 'text' }).default('')
}); 

export const records = sqliteTable('records', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    folderId: integer('folderId', { mode: 'number' }).references(() => folders.id),
    description: text('description'),
    type: text('type'),

    title: text('title'),
    tags: text('tags'),
    
    json: text('json', { mode: 'json' }),
    text: text('text'),

    transcription: text('transcription'),

    checksum: text('checksum'),
    checksumLastParsed: text('checksumLastParsed'),

    extra: text('extra', { mode: 'json' }),
    attachments: text('attachments', { mode: 'json' }),
    
    eventDate: text('eventDate').notNull().default(''),
    createdAt: text('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP`)
});


export const encryptedAttachments = sqliteTable('encryptedAttachments', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    
    displayName: text('displayName'),
    type: text('type'),
    url: text('url'),
    mimeType: text('mimeType'),

    assignedTo: text('assignedTo', { mode: 'json' }),

    json: text('json', { mode: 'json' }),
    extra: text('extra', { mode: 'json' }),
    size: integer('size', { mode: 'number' }),    


    storageKey: text('storageKey'),
    description: text('description'),
    
    createdAt: text('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP`)
});

export const terms = sqliteTable('terms', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    content: text('content'),
    code: text('code'),
    key: text('key'),
    signature: text('signature'),
    ip: text('ip'),
    ua: text('ua'),
    name: text('name'),
    email: text('email'),
    signedAt: text('signedAt').notNull().default(sql`CURRENT_TIMESTAMP`)
});

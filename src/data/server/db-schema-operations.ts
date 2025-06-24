import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const operations = sqliteTable('operations', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    recordId: integer('recordId', { mode: 'number' }),
    operationId: text('operationId'),
    operationName: text('operationName'),
    operationProgress: integer('operationProgress', { mode: 'number' }),
    operationProgressOf: integer('operationProgressOf', { mode: 'number' }),
    operationPage: integer('operationPage', { mode: 'number' }),
    operationPages: integer('operationPages', { mode: 'number' }),
    operationMessage: text('operationMessage'),
    operationTextDelta: text('operationTextDelta'),
    operationPageDelta: text('operationPageDelta'),
    operationRecordText: text('operationRecordText'),
    operationStartedOn: text('operationStartedOn'),
    operationStartedOnUserAgent: text('operationStartedOnUserAgent'),
    operationStartedOnSessionId: text('operationStartedOnSessionId'),
    operationLastStep: text('operationLastStep'),
    operationLastStepUserAgent: text('operationLastStepUserAgent'),
    operationLastStepSessionId: text('operationLastStepSessionId'),
    operationFinished: integer('operationFinished', { mode: 'boolean' }).default(false),
    operationErrored: integer('operationErrored', { mode: 'boolean' }).default(false),
    operationErrorMessage: text('operationErrorMessage')
});


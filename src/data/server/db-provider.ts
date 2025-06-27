import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from 'path'
import { getCurrentTS } from '@/lib/utils';
import fs from 'fs';

const rootPath = path.resolve(process.cwd())

export type DatabaseManifest = {
	databaseIdHash: string,
	createdAt: string,

	creator: {
		ip?: string,
		ua?: string,
		geo?: {
			country?: string,
			city?: string,
			latitute?: string,
			longitude?: string,
		}
	}
}

export const maintenance = { 
	databaseDirectory: (databaseId:string, databaseSchema:string = '', databasePartition: string = '') =>  path.join(rootPath, 'data', databaseId, databasePartition ? (databaseSchema ? databaseSchema + '-partitions' : 'partitions') : ''),
	databaseFileName: (databaseId:string, databaseSchema:string = '', databasePartition: string = '') =>  path.join(maintenance.databaseDirectory(databaseId, databaseSchema, databasePartition), `db${databaseSchema ? '-' + databaseSchema + (databasePartition ? '-' + databasePartition : '') : (databasePartition ? '-' + databasePartition : '')}.sqlite`),
	createDatabaseManifest: async (databaseId: string, databaseManifest: DatabaseManifest) => {
		const databaseDirectory = maintenance.databaseDirectory(databaseId)
		if (!fs.existsSync(databaseDirectory)) {
			fs.mkdirSync(databaseDirectory, { recursive: true })
		}

		console.log('Creating new database hash = ' + databaseId);
		const newDb = (await pool)(databaseId, '', '', true); // create main database file (empty schema)

		const manifestPath = path.join(databaseDirectory, 'manifest.json')
		if (!fs.existsSync(manifestPath)) {
			fs.writeFileSync(manifestPath, JSON.stringify({
				...databaseManifest,
				createdAt: getCurrentTS(),
			}))
		}
	},
	checkIfDatabaseExists: (databaseId: string) => {
		try {
			fs.accessSync(maintenance.databaseFileName(databaseId))
			return true
		} catch (error) {
			return false
		}
	}
}

export const Pool = async (maxPool = 50) => {
	const databaseInstances: Record<string, BetterSQLite3Database> = {}
	return async (databaseId: string, databaseSchema:string = '', databasePartition:string = '', createNewDb: boolean = false ) => {
		const poolKey = `${databaseId}-${databaseSchema}${databasePartition ? '-' + databasePartition : ''}` // TODO: maybe we should use different pools for different schemas? however as for now it makes no big difference
		if (databaseInstances[poolKey]) {
			return databaseInstances[poolKey]
		}

		if (Object.keys(databaseInstances).length >= maxPool) {
			delete databaseInstances[Object.keys(databaseInstances)[0]]
		}

		const databaseFile = maintenance.databaseFileName(databaseId, databaseSchema, databasePartition)
		let requiresMigration = true

		if(!maintenance.checkIfDatabaseExists(databaseId)) {
            if (!createNewDb) {
                throw new Error('Database not found or inaccessible')
            }			
		}

		if (databasePartition) { // we store partitions in `audit-partitions` subfolder for example therefore we need to make sure the directory exists
			const databaseDirectory = maintenance.databaseDirectory(databaseId, databaseSchema, databasePartition)
			if (!fs.existsSync(databaseDirectory)) {
				fs.mkdirSync(databaseDirectory, { recursive: true })
			}
		}


		const db = new Database(databaseFile)
		databaseInstances[poolKey] = drizzle(db)

		if (requiresMigration) { // we are never skipping running the migrations when first adding database to the pool bc of possible changes in the schema
            console.log('Running migrations')
			await migrate(databaseInstances[poolKey], { migrationsFolder: `drizzle${ databaseSchema ? '-' + databaseSchema : '' }` }) // database migrations in subfolder for different schemas
		}

		return databaseInstances[poolKey]
	}
}

export const pool = Pool()
import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { env } from '../env'
import * as schema from './schema'

mkdirSync(dirname(env.databasePath), { recursive: true })

const sqlite = new Database(env.databasePath, { create: true })
sqlite.exec('PRAGMA journal_mode = WAL;')
sqlite.exec('PRAGMA foreign_keys = ON;')

export const db = drizzle(sqlite, { schema })
export type Db = typeof db

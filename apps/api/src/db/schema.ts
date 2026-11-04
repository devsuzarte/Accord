import { sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Esquema inicial — docs/02-arquitetura.md › Modelo de dados.
 * Presença (quem está em qual canal) NÃO fica no banco: vive em memória na API.
 */

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)

export const users = sqliteTable('users', {
  id: id(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  avatarPath: text('avatar_path'),
  createdAt: createdAt(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
})

export const memberships = sqliteTable(
  'memberships',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member'] })
      .notNull()
      .default('member'),
    joinedAt: createdAt(),
    bannedAt: integer('banned_at', { mode: 'timestamp_ms' }),
  },
  (t) => [primaryKey({ columns: [t.userId] })],
)

export const channels = sqliteTable('channels', {
  id: id(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  userLimit: integer('user_limit'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
})

export const invites = sqliteTable('invites', {
  code: text('code').primaryKey(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  maxUses: integer('max_uses'),
  uses: integer('uses').notNull().default(0),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
})

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  userAgent: text('user_agent'),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
})

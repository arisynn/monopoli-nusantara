import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {
 code: text('code').primaryKey(), data: text('data').notNull(), revision: integer('revision').notNull().default(0),
 aiUntil: integer('ai_until').notNull().default(0), updated: integer('updated').notNull(),
});
export const quotas=sqliteTable('quotas',{key:text('key').primaryKey(),count:integer('count').notNull().default(0)});

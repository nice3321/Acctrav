import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Storage is SQLite through Node's built-in driver — no native build step, no
 * external service, no ORM. The whole ledger is one file you can copy, diff and
 * archive, which is exactly what a small finance team needs for a backup story.
 *
 * Money columns are INTEGER halalas. There is no REAL column anywhere in this
 * schema by design: SQLite REAL is IEEE-754 and would silently round payouts.
 *
 * Migrations live in `migrations/*.sql` so the app and the CLI scripts apply the
 * exact same DDL — a schema that drifts between them is a data-loss bug waiting.
 */

// turbopackIgnore keeps the bundler from tracing the entire project into the server
// output just because these paths are computed at runtime. Both resolve against the
// process CWD, which is the project root under `next dev` and `next start`.
export const DB_PATH = resolve(/* turbopackIgnore: true */ process.env.ACCTRAV_DB ?? "./data/acctrav.db");
const MIGRATIONS_DIR = resolve(/* turbopackIgnore: true */ process.env.ACCTRAV_MIGRATIONS ?? "./migrations");

declare global {
  var __acctravDb: DatabaseSync | undefined;
}

export function migrate(db: DatabaseSync, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);

  const applied = new Set(
    (db.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((r) => r.id),
  );
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];

  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    if (applied.has(id)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (id) VALUES (?)").run(id);
      db.exec("COMMIT");
      ran.push(id);
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${id} failed: ${(err as Error).message}`);
    }
  }
  return ran;
}

function open(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

/** Hot reload in dev re-evaluates modules; without the global we'd leak handles. */
export function getDb(): DatabaseSync {
  if (!globalThis.__acctravDb) globalThis.__acctravDb = open();
  return globalThis.__acctravDb;
}

/** Run `fn` inside a transaction; any throw rolls the whole thing back. */
export function tx<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const out = fn(db);
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Rows come back as untyped records; this keeps the casts honest at call sites. */
export function rows<T>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[];
}
export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...(params as never[])) as T | undefined;
}
export function run(sql: string, ...params: unknown[]): void {
  getDb().prepare(sql).run(...(params as never[]));
}

/**
 * Applies every pending migration in `migrations/` to the ledger database.
 * Safe to re-run: already-applied files are skipped.
 *
 *   node scripts/migrate.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(process.env.ACCTRAV_DB ?? resolve(HERE, "../data/acctrav.db"));
const DIR = resolve(HERE, "../migrations");

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);

const applied = new Set(db.prepare("SELECT id FROM _migrations").all().map((r) => r.id));
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
let ran = 0;

for (const file of files) {
  const id = file.replace(/\.sql$/, "");
  if (applied.has(id)) continue;
  db.exec("BEGIN");
  try {
    db.exec(readFileSync(join(DIR, file), "utf8"));
    db.prepare("INSERT INTO _migrations (id) VALUES (?)").run(id);
    db.exec("COMMIT");
    console.log(`  ✓ ${id}`);
    ran++;
  } catch (err) {
    db.exec("ROLLBACK");
    console.error(`  ✗ ${id}: ${err.message}`);
    process.exit(1);
  }
}

console.log(ran ? `✓ طُبِّق ${ran} ترحيل على ${DB_PATH}` : `✓ لا ترحيلات معلّقة (${files.length} مطبّقة)`);

/**
 * Seeds the ledger from the company's real imported reports (2025-01 … 2026-07).
 *
 * Idempotent: refuses to run against a database that already has periods unless
 * you pass --force, which wipes and rebuilds. Account passwords are generated,
 * never hardcoded, and written to a gitignored file for the admin to hand out.
 *
 *   node scripts/seed.mjs [--force]
 */
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(process.env.ACCTRAV_DB ?? resolve(HERE, "../data/acctrav.db"));
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const force = process.argv.includes("--force");

/**
 * Two data sets live side by side:
 *   seed-source.json — the company's real reports. Gitignored; it never leaves
 *                      the finance machine, because it contains staff earnings.
 *   seed-demo.json   — synthetic data of the same shape, safe to publish, so a
 *                      fresh clone still boots into a working system.
 * The real file wins when it is present.
 */
// ACCTRAV_SEED lets a deployment point at real data mounted outside the image —
// the real file is never baked into a container or pushed to a repo.
const REAL = resolve(process.env.ACCTRAV_SEED ?? resolve(HERE, "seed-source.json"));
const DEMO = resolve(HERE, "seed-demo.json");
const sourcePath = existsSync(REAL) ? REAL : DEMO;
const usingReal = sourcePath === REAL;
const src = JSON.parse(readFileSync(sourcePath, "utf8"));

/* --------------------------- helpers --------------------------- */
const toHalalas = (sar) => {
  const n = Number(sar);
  if (!Number.isFinite(n)) return 0;
  const scaled = n * 100;
  const r = Math.round(Math.abs(scaled) + Number.EPSILON * Math.abs(scaled));
  return n < 0 ? -r : r;
};
const bp = (rate) => Math.round(rate * 10000);
const hash = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return { hash: scryptSync(pw, salt, SCRYPT.keylen, SCRYPT).toString("hex"), salt };
};
const newPassword = () => {
  // Readable but high-entropy: 4 groups of 4 from an unambiguous alphabet (~72 bits).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n) => Array.from(randomBytes(n)).map((b) => alphabet[b % alphabet.length]).join("");
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
};
const latinAlias = (aliases) => aliases.find((a) => /^[A-Za-z][A-Za-z .]*$/.test(a.trim()));

/* --------------------------- open db --------------------------- */
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");

const hasSchema = db
  .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='periods'")
  .get().n > 0;

if (!hasSchema) {
  console.error("✗ الجداول غير موجودة. شغّل التطبيق مرة واحدة (npm run dev) لتطبيق الترحيلات ثم أعد المحاولة.");
  process.exit(1);
}

const existing = db.prepare("SELECT count(*) AS n FROM periods").get().n;
if (existing > 0 && !force) {
  console.error(`✗ القاعدة تحتوي ${existing} فترة بالفعل. استخدم --force للمسح وإعادة البناء.`);
  process.exit(1);
}

/* --------------------------- seed --------------------------- */
db.exec("BEGIN");
try {
  if (force) {
    for (const t of [
      "payouts", "adjustments", "department_incentives", "commission_items", "commission_cycles",
      "transactions", "sales_rows", "periods", "name_matches", "sessions", "users",
      "employee_aliases", "employees", "expenses", "budgets", "expense_categories",
      "policy", "audit_events",
    ]) db.exec(`DELETE FROM ${t}`);
  }

  // --- employees + aliases ---
  const insEmp = db.prepare("INSERT INTO employees (id, name, status, target_halalas) VALUES (?,?,?,0)");
  const insAlias = db.prepare("INSERT OR IGNORE INTO employee_aliases (employee_id, alias) VALUES (?,?)");
  for (const e of src.employees) {
    insEmp.run(e.id, e.name, e.status === "excluded" ? "excluded" : "active");
    insAlias.run(e.id, e.name);
    for (const a of e.aliases) insAlias.run(e.id, a);
  }

  // --- periods + sales rows ---
  const insPeriod = db.prepare(
    "INSERT INTO periods (id, label, start_date, end_date, source, monthly_cost_halalas) VALUES (?,?,?,?,?,?)",
  );
  const insRow = db.prepare(
    `INSERT INTO sales_rows (period_id, employee_id, sales_halalas, profit_halalas, sale_count, refund_count)
     VALUES (?,?,?,?,?,?)`,
  );
  const empIds = new Set(src.employees.map((e) => e.id));
  let rowCount = 0;
  for (const p of src.periods) {
    // The monthly cost target only exists from 2026-01 onward; archive months ran
    // on the old tier scheme where no company-wide target applied.
    const cost = p.start >= "2026-01-01" ? toHalalas(250000) : 0;
    insPeriod.run(p.id, p.label, p.start, p.end, p.source ?? null, cost);
    for (const r of p.rows) {
      if (!empIds.has(r.emp)) continue;
      insRow.run(p.id, r.emp, toHalalas(r.sales), toHalalas(r.profit), r.saleCount ?? null, r.refundCount ?? null);
      rowCount++;
    }
  }

  // --- transactions ---
  const insTx = db.prepare(
    `INSERT INTO transactions (id, period_id, employee_id, tx_date, service, price_halalas, profit_halalas, channel, notes)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  let txCount = 0;
  for (const [periodId, byEmp] of Object.entries(src.transactions)) {
    for (const [empId, list] of Object.entries(byEmp)) {
      if (!empIds.has(empId)) continue;
      for (const t of list) {
        insTx.run(randomUUID(), periodId, empId, t.date, t.service ?? null,
          toHalalas(t.price), toHalalas(t.profit), t.channel ?? null, t.notes ?? null);
        txCount++;
      }
    }
  }

  // --- policy (converted to basis points) ---
  const sp = src.policy;
  const policy = {
    targetModelEffectiveFrom: sp.targetModelEffectiveFrom,
    levels: sp.target.levels.map((l) => ({
      id: l.id, label: l.label, costMultiplierBp: bp(l.costMultiplier), rateBp: bp(l.rate),
    })),
    weightBlendBp: bp(sp.target.weightBlend),
    departments: sp.departments.map((d) => ({
      id: d.id, name: d.name,
      levelRatesBp: Object.fromEntries(Object.entries(d.levelRates).map(([k, v]) => [k, bp(v)])),
    })),
    individualFallback: { enabled: sp.individualFallback.enabled, rateBp: bp(sp.individualFallback.rate) },
    vat: { enabled: sp.vat.enabled, rateBp: bp(sp.vat.rate) },
    legacyTiers: sp.legacy.tiers.map((t) => ({
      label: t.label, fromHalalas: toHalalas(t.from),
      toHalalas: t.to === null ? null : toHalalas(t.to), rateBp: bp(t.rate),
    })),
    legacyDeductRefunds: sp.legacy.refundHandling === "deduct_refund_profit",
    minEligibleProfitHalalas: toHalalas(sp.minEligibleProfit),
  };
  db.prepare("INSERT INTO policy (body, status, approved_by, approved_at) VALUES (?,?,?,?)")
    .run(JSON.stringify(policy), "approved", "المدير التنفيذي", "2026-01-01");

  // --- expense categories ---
  const cats = [
    ["cat_sal", "رواتب وأجور", "#2E7D6F"], ["cat_rent", "إيجارات", "#8E6BC8"],
    ["cat_mkt", "تسويق وإعلان", "#D08A2C"], ["cat_tech", "اشتراكات وتقنية", "#2E8DA6"],
    ["cat_gov", "رسوم حكومية وتراخيص", "#5A6ACF"], ["cat_bank", "رسوم بنكية", "#3B9C6A"],
    ["cat_office", "مكتبية وضيافة", "#C8544A"], ["cat_other", "مصروفات أخرى", "#7A8A86"],
  ];
  const insCat = db.prepare("INSERT INTO expense_categories (id, name, color) VALUES (?,?,?)");
  for (const c of cats) insCat.run(...c);

  // --- users ---
  const credentials = [];
  const insUser = db.prepare(
    `INSERT INTO users (id, username, password_hash, salt, display_name, role, employee_id, must_change_password)
     VALUES (?,?,?,?,?,?,?,1)`,
  );
  const addUser = (username, displayName, role, employeeId) => {
    const pw = newPassword();
    const { hash: h, salt } = hash(pw);
    insUser.run(randomUUID(), username, h, salt, displayName, role, employeeId);
    credentials.push({ username, displayName, role, password: pw });
  };

  addUser("owner", "المدير التنفيذي", "owner", null);
  addUser("cfo", "المدير المالي", "cfo", null);
  addUser("sales.manager", "مدير المبيعات", "sales_manager", null);

  const used = new Set(["owner", "cfo", "sales.manager"]);
  for (const e of src.employees) {
    const la = latinAlias(e.aliases);
    let base = la ? la.trim().toLowerCase().replace(/\s+/g, ".") : `emp${e.id.replace("e", "")}`;
    let candidate = base, n = 2;
    while (used.has(candidate)) candidate = `${base}${n++}`;
    used.add(candidate);
    addUser(candidate, e.name, "employee", e.id);
  }

  // --- unresolved name matches carried over from the source imports ---
  // These reference specific employees from the real reports, so they are skipped
  // entirely when seeding the demo data set (whose ids differ).
  const insMatch = db.prepare(
    "INSERT INTO name_matches (id, raw_name, source, suggested_id, confidence, resolved) VALUES (?,?,?,?,?,0)",
  );
  const carriedMatches = usingReal
    ? [
        ["هانى", "مبيعات_2026_يناير_-_يونيو.xlsx (اسم الورقة)", "e15", "متوسطة"],
        ["صالح", "مبيعات_2026_يناير_-_يونيو.xlsx (اسم الورقة)", "e12", "متوسطة"],
        ["الكومانى", "مبيعات_2026_يناير_-_يونيو.xlsx (اسم الورقة)", "e6", "متوسطة"],
      ]
    : [["اسم غير مطابق", "ملف تجريبي (اسم الورقة)", src.employees[0].id, "متوسطة"]];
  for (const m of carriedMatches) {
    if (!empIds.has(m[2])) continue; // never insert a dangling reference
    insMatch.run(randomUUID(), m[0], m[1], m[2], m[3]);
  }

  // --- audit history from the source system ---
  const insAudit = db.prepare(
    "INSERT INTO audit_events (id, at, actor_id, actor_name, action, entity, details) VALUES (?,?,NULL,?,?,?,?)",
  );
  const history = usingReal ? [
    ["2026-04-29 18:43", "المدير المالي", "استيراد بيانات", "period", "استيراد تقرير يناير-مارس 2026 (تفصيلي) — قُسِّم إلى 3 فترات شهرية"],
    ["2026-05-02 10:00", "المدير التنفيذي", "اعتماد سياسة", "policy", "اعتماد نظام الهدف الشهري من يناير 2026: تكاليف 250,000 ر.س، ثم عمولة من الفائض حسب المستوى المتحقق"],
    ["2026-07-19 10:16", "المدير المالي", "تنبيه تضارب بيانات", "period", "أرقام يناير-مارس 2026 في ملف الحجوزات تختلف عن المعتمد — لم يُستبدل تلقائيًا"],
    ["2026-07-23 09:13", "المدير المالي", "تنبيه تضارب بيانات", "period", "ورقة ديسمبر في الملف السنوي تخالف المعتمد (777,307.50 مقابل 926,528.50 مبيعات) — لم يُستبدل"],
  ] : [];
  history.push([
    new Date().toISOString().slice(0, 19).replace("T", " "), "النظام", "تهيئة النظام", "system",
    `بذر ${usingReal ? "بيانات الشركة" : "بيانات تجريبية"}: ${src.employees.length} موظف · ${src.periods.length} فترة · ${rowCount} سجل مبيعات · ${txCount} حجز`,
  ]);
  for (const a of history) insAudit.run(randomUUID(), a[0], a[1], a[2], a[3], a[4]);

  db.exec("COMMIT");

  /* --------------------------- credentials file --------------------------- */
  const lines = [
    "بيانات الدخول — نظام Acctrav المالي (ترافليون)",
    "=".repeat(60),
    "",
    "⚠ هذا الملف غير مرفوع على Git. سلّم كل حساب لصاحبه ثم احذف الملف.",
    "⚠ كل حساب مُلزم بتغيير كلمة المرور عند أول دخول.",
    "",
  ];
  for (const group of ["owner", "cfo", "sales_manager", "employee"]) {
    const rows = credentials.filter((c) => c.role === group);
    if (!rows.length) continue;
    lines.push(`--- ${group} ---`);
    for (const c of rows) lines.push(`  ${c.username.padEnd(22)} ${c.password}   (${c.displayName})`);
    lines.push("");
  }
  // On a server the app directory is read-only and ephemeral, so the credentials
  // land next to the database on the persistent volume instead.
  const credPath = resolve(process.env.ACCTRAV_CREDENTIALS ?? resolve(HERE, "../credentials.local.txt"));
  writeFileSync(credPath, lines.join("\n"), "utf8");

  console.log(`✓ تم البذر بنجاح — المصدر: ${usingReal ? "بيانات الشركة الفعلية" : "بيانات تجريبية (seed-demo.json)"}`);
  console.log(`  الموظفون:      ${src.employees.length}`);
  console.log(`  الفترات:       ${src.periods.length}`);
  console.log(`  سجلات المبيعات: ${rowCount}`);
  console.log(`  الحجوزات:      ${txCount}`);
  console.log(`  الحسابات:      ${credentials.length}`);
  console.log(`\n  بيانات الدخول → ${credPath}`);
} catch (err) {
  db.exec("ROLLBACK");
  console.error("✗ فشل البذر:", err.message);
  process.exit(1);
}

#!/bin/sh
set -e

# Migrations are idempotent and must run before the app opens the database, so a
# container restart after a schema change never serves against an old schema.
echo "→ تطبيق الترحيلات…"
node scripts/migrate.mjs

# Seed once, on an empty ledger only. A restart must never re-seed: that would wipe
# real payout history and regenerate everyone's password.
if [ ! -f /data/.seeded ]; then
  echo "→ قاعدة فارغة — بذر البيانات لأول مرة…"
  node scripts/seed.mjs
  touch /data/.seeded
  echo "→ تم البذر. بيانات الدخول في /data/credentials.local.txt"
else
  echo "→ القاعدة مبذورة مسبقًا — تخطي البذر."
fi

exec "$@"

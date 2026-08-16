# النشر

النظام منشور على VPS ضمن Docker خلف بروكسي Coolify (Traefik) مع شهادة Let's Encrypt.

| | |
|---|---|
| الرابط | https://acctrav.186.241.16.106.sslip.io |
| الخادم | `vps-new` — 186.241.16.106 |
| الحاوية | `acctrav` · صورة `acctrav:1.0` |
| القاعدة | volume باسم `acctrav-data` على `/data` |
| الشبكة | `coolify` (نفس شبكة Traefik) |
| النسخ الاحتياطي | يوميًا 02:17 → `/opt/acctrav/backups`, يُحفظ 30 يومًا |

## تحديث النظام بعد تعديل الكود

```bash
ssh vps-new
cd /opt/acctrav/repo && git pull
docker build -t acctrav:1.0 .
docker restart acctrav      # الترحيلات تُطبَّق تلقائيًا عند الإقلاع
```

القاعدة على volume منفصل، فإعادة البناء لا تمسّها. البذر يجري مرة واحدة فقط
(بعلامة `/data/.seeded`)، فإعادة التشغيل لا تُعيد توليد كلمات المرور.

## بيانات الشركة الفعلية

مرفوعة مباشرة إلى `/opt/acctrav/secrets/seed-source.json` عبر `scp` — لم تمر بمستودع
Git إطلاقًا. الملف مملوك لـ uid 1001 بصلاحية `400`، ومُمرَّر للحاوية للقراءة فقط.

## استعادة نسخة احتياطية

```bash
ssh vps-new
docker stop acctrav
gunzip -c /opt/acctrav/backups/acctrav-YYYYMMDD-HHMM.db.gz > /tmp/restore.db
docker cp /tmp/restore.db acctrav:/data/acctrav.db
docker start acctrav
```

## متابعة التشغيل

```bash
docker logs -f acctrav            # السجل الحيّ
docker ps --filter name=acctrav   # الحالة والصحة
docker exec acctrav cat /data/credentials.local.txt   # بيانات الدخول المولّدة
```

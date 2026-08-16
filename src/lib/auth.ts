import "server-only";
import { cookies } from "next/headers";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, nowIso } from "./db";
import { ForbiddenError, type Permission, type Role, can } from "./rbac";

const SESSION_COOKIE = "acctrav_session";
const SESSION_HOURS = 12;
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  employeeId: string | null;
  mustChangePassword: boolean;
}

/* ----------------------------- passwords ----------------------------- */

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  // Length check first: timingSafeEqual throws on mismatched buffers.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Reject the passwords that make an audit finding write itself. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "كلمة المرور يجب ألا تقل عن 10 أحرف";
  if (!/[A-Za-z]/.test(password)) return "يجب أن تحتوي على حرف لاتيني واحد على الأقل";
  if (!/[0-9]/.test(password)) return "يجب أن تحتوي على رقم واحد على الأقل";
  const weak = ["password", "12345678", "qwerty", "admin", "travelion", "acctrav"];
  if (weak.some((w) => password.toLowerCase().includes(w))) return "كلمة المرور شائعة جدًا — اختر واحدة أقوى";
  return null;
}

/* ------------------------------ sessions ----------------------------- */

interface UserRow {
  id: string; username: string; password_hash: string; salt: string;
  display_name: string; role: Role; employee_id: string | null;
  active: number; must_change_password: number;
  failed_attempts: number; locked_until: string | null;
}

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(username.trim()) as UserRow | undefined;

  // Same message whether the account is missing or the password is wrong, so the
  // form cannot be used to enumerate who works here.
  const generic = { ok: false as const, error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
  if (!row || !row.active) return generic;

  if (row.locked_until && row.locked_until > nowIso()) {
    return { ok: false, error: `الحساب موقوف مؤقتًا بعد محاولات فاشلة. حاول بعد ${LOCKOUT_MINUTES} دقيقة.` };
  }

  if (!verifyPassword(password, row.password_hash, row.salt)) {
    const attempts = row.failed_attempts + 1;
    const lockUntil =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString().slice(0, 19).replace("T", " ")
        : null;
    db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?")
      .run(attempts, lockUntil, row.id);
    return generic;
  }

  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(row.id);

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, row.id, expires.toISOString().slice(0, 19).replace("T", " "));

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  db.prepare("INSERT INTO audit_events (id, actor_id, actor_name, action, entity, details) VALUES (?,?,?,?,?,?)")
    .run(randomUUID(), row.id, row.display_name, "تسجيل دخول", "session", `دخول ${row.username}`);

  return { ok: true, user: toSessionUser(row) };
}

function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    employeeId: row.employee_id,
    mustChangePassword: row.must_change_password === 1,
  };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(SESSION_COOKIE);
}

/** The session, or null. Expired rows are deleted as they are encountered. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const session = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?")
    .get(token) as { user_id: string; expires_at: string } | undefined;
  if (!session) return null;

  if (session.expires_at <= nowIso()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  const row = db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(session.user_id) as
    | UserRow
    | undefined;
  return row ? toSessionUser(row) : null;
}

/* ---------------------------- authorization --------------------------- */

/** Every mutation calls this. Throws rather than returning a flag so a forgotten
 *  `if` cannot silently authorize the action. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ForbiddenError(permission);
  if (!can(user.role, permission)) throw new ForbiddenError(permission);
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ForbiddenError("view.self");
  return user;
}

/**
 * An employee may only ever read their own statement. Managers with `view.all`
 * pass through. This is the one check standing between a salesperson and their
 * colleagues' pay, so it lives here rather than in any page.
 */
export async function assertCanReadEmployee(employeeId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (can(user.role, "view.all")) return user;
  if (user.employeeId && user.employeeId === employeeId) return user;
  throw new ForbiddenError("view.all");
}

export async function changePassword(userId: string, next: string): Promise<void> {
  const problem = passwordProblem(next);
  if (problem) throw new Error(problem);
  const { hash, salt } = hashPassword(next);
  getDb()
    .prepare("UPDATE users SET password_hash = ?, salt = ?, must_change_password = 0 WHERE id = ?")
    .run(hash, salt, userId);
  // Force every other device to re-authenticate with the new secret.
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export { SESSION_COOKIE };

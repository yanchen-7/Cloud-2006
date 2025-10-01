export const RESERVED_USERNAMES = new Set(["admin", "administrator", "root", "support", "system", "owner"]);
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
export const PASSWORD_LENGTH_MIN = 12;
export const ALLOWED_GENDERS = new Set(["Female", "Male", "Non-binary", "Other"]);
export const COUNTRY_PATTERN = /^[A-Za-z .'-]{2,64}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeOptional(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeRequired(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function isValidPassword(password) {
  if (password.length < PASSWORD_LENGTH_MIN) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

export function parseDateOfBirth(raw) {
  if (!raw) return { value: null, age: null };
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw)) return { error: "Date of birth must be in YYYY-MM-DD format" };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { error: "Date of birth is invalid" };
  const today = new Date();
  if (parsed > today) return { error: "Date of birth cannot be in the future" };
  const age = today.getFullYear() - parsed.getFullYear() - (today < new Date(today.getFullYear(), parsed.getMonth(), parsed.getDate()) ? 1 : 0);
  if (age < 13) return { error: "Users must be at least 13 years old" };
  if (age > 120) return { error: "Date of birth is out of range" };
  return { value: raw, age };
}

export function buildSessionUser(row) {
  if (!row) return null;
  return {
    account_id: row.account_id,
    username: row.username,
    email: row.email,
    role: row.role || "user",
  };
}

export function currentUserFromSession(req) {
  const user = req.session.user || null;
  if (!user) return null;
  return buildSessionUser(user);
}

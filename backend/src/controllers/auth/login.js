import bcrypt from "bcryptjs";
import { pool } from "../../mysql.js";
import {
  EMAIL_PATTERN,
  USERNAME_PATTERN,
  normalizeOptional,
  normalizeRequired,
  buildSessionUser,
} from "../../utils/auth.js";

export async function login(req, res) {
  const {
    username: rawUsername,
    email: rawEmail,
    identifier: rawIdentifier,
    password: rawPassword,
  } = req.body || {};

  const username = normalizeRequired(rawUsername);
  const email = normalizeOptional(rawEmail)?.toLowerCase() || "";
  const identifier = normalizeRequired(rawIdentifier);
  const password = typeof rawPassword === "string" ? rawPassword : "";

  const errors = {};

  const credential = identifier || email || username;
  const usingEmail = credential.includes("@");

  if (!credential) {
    errors.username = "Username or email is required";
  } else if (usingEmail && !EMAIL_PATTERN.test(credential)) {
    errors.username = "Email format is invalid";
  } else if (!usingEmail && !USERNAME_PATTERN.test(credential)) {
    errors.username = "Username format is invalid";
  }

  if (!password) {
    errors.password = "Password is required";
  }

  if (Object.keys(errors).length) {
    return res.status(422).json({ error: "Validation failed", details: errors });
  }

  try {
    const queryField = usingEmail ? "email" : "username";
    const [rows] = await pool.query(
      `SELECT account_id, username, email, role, password AS password_hash FROM accounts WHERE ${queryField} = ? LIMIT 1`,
      [usingEmail ? credential.toLowerCase() : credential]
    );
    const acct = rows[0];
    if (!acct || !acct.password_hash || !(await bcrypt.compare(password, acct.password_hash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const sessionUser = buildSessionUser(acct);
    req.session.user = sessionUser;
    res.json({ authenticated: true, user: sessionUser });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
}

import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../mysql.js";

const router = express.Router();

function currentUserFromSession(req) {
  const user = req.session.user || null;
  if (!user) return null;
  return {
    account_id: user.account_id,
    username: user.username,
    email: user.email,
    role: user.role || "user",
  };
}

router.get("/", async (req, res) => {
  return res.json({ authenticated: !!req.session.user, user: currentUserFromSession(req) });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  try {
    const [rows] = await pool.query(
      "SELECT account_id, username, email, role, password AS password_hash FROM accounts WHERE username = ? LIMIT 1",
      [username]
    );
    const acct = rows[0];
    if (!acct || !acct.password_hash || !(await bcrypt.compare(password, acct.password_hash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    req.session.user = { account_id: acct.account_id, username: acct.username, email: acct.email, role: acct.role };
    res.json({ authenticated: true, user: currentUserFromSession(req) });
  } catch (e) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.post("/register", async (req, res) => {
  const { username, email, password, gender, date_of_birth, country_of_origin } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    const [existsUser] = await pool.query("SELECT 1 FROM accounts WHERE username = ? LIMIT 1", [username]);
    if (existsUser.length) return res.status(409).json({ error: "Username exists" });
    const [existsEmail] = await pool.query("SELECT 1 FROM accounts WHERE email = ? LIMIT 1", [email]);
    if (existsEmail.length) return res.status(409).json({ error: "Email exists" });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO accounts (email, password, role, gender, username, date_of_birth, country_of_origin, age, created_at, updated_at)
       VALUES (?, ?, 'user', ?, ?, ?, ?, NULL, NOW(), NOW())`,
      [email, hash, gender || null, username, date_of_birth || null, country_of_origin || null]
    );
    res.status(201).json({ account_id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: "Registration failed" });
  }
});

export default router;


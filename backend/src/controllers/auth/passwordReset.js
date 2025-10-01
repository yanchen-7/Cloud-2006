import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

import { pool } from "../../mysql.js";
import { EMAIL_PATTERN, isValidPassword } from "../../utils/auth.js";

let passwordResetTableEnsured = false;

async function ensurePasswordResetTable() {
  if (passwordResetTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      account_id INT UNSIGNED NOT NULL,
      token_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_token_hash (token_hash),
      INDEX idx_account_id (account_id),
      CONSTRAINT fk_password_resets_account
        FOREIGN KEY (account_id) REFERENCES accounts(account_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  passwordResetTableEnsured = true;
}

function buildTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn("SMTP configuration missing or incomplete. Falling back to console mailer.");
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
  });
}

function buildResetUrl(token) {
  const rawBase = process.env.PASSWORD_RESET_URL || process.env.APP_BASE_URL || "http://localhost:5173";
  try {
    const url = new URL(rawBase);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/reset-password";
    }
    const params = new URLSearchParams(url.search);
    params.set("token", token);
    url.search = params.toString();
    return url.toString();
  } catch (err) {
    return `http://localhost:5173/reset-password?token=${token}`;
  }
}

export async function requestPasswordReset(req, res) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_PATTERN.test(email)) {
    return res.status(422).json({ error: "Validation failed", details: { email: "Valid email is required" } });
  }

  try {
    const [accounts] = await pool.query(
      "SELECT account_id, email FROM accounts WHERE email = ? LIMIT 1",
      [email]
    );

    // Always respond success to avoid account enumeration
    if (!accounts.length) {
      return res.json({ message: "If that account exists, a reset email has been sent" });
    }

    const account = accounts[0];

    await ensurePasswordResetTable();

    const rawToken = crypto.randomBytes(48).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query("DELETE FROM password_resets WHERE account_id = ?", [account.account_id]);
    await pool.query(
      "INSERT INTO password_resets (account_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [account.account_id, tokenHash, expires]
    );

    const transporter = buildTransporter();
    try {
      await transporter.verify();
    } catch (verifyErr) {
      console.error("SMTP verification failed", verifyErr);
      throw new Error("SMTP verification failed");
    }
    const resetUrl = buildResetUrl(rawToken);
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@cloud2006.local";

    const info = await transporter.sendMail({
      from,
      to: account.email,
      subject: "Reset your Cloud-2006 password",
      text: `You requested a password reset. Click the link below to set a new password. If you did not make this request, you can ignore this email.\n\n${resetUrl}\n\nThis link expires in 60 minutes.`,
      html: `
        <p>You requested a password reset for your Cloud-2006 account.</p>
        <p><a href="${resetUrl}" target="_blank" rel="noopener">Click here to set a new password</a>.</p>
        <p>If the button does not work, copy and paste this URL into your browser:</p>
        <p><code>${resetUrl}</code></p>
        <p>This link expires in 60 minutes. If you did not request a reset, you can safely ignore this message.</p>
      `,
    });

    if (info?.message) {
      try {
        const parsed = JSON.parse(info.message);
        console.info("Password reset email (development mode):", parsed);
      } catch (err) {
        console.info("Password reset email (development mode)", info);
      }
    }

    return res.json({ message: "If that account exists, a reset email has been sent" });
  } catch (err) {
    console.error("Failed to send password reset email", err);
    const message = err?.message || "Unable to process password reset";
    if (process.env.NODE_ENV !== "production" && err?.stack) {
      return res.status(500).json({ error: message });
    }
    return res.status(500).json({ error: "Unable to process password reset" });
  }
}

export async function resetPassword(req, res) {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";

  const errors = {};
  if (!token) errors.token = "Reset token is required";
  if (!password) {
    errors.password = "Password is required";
  } else if (!isValidPassword(password)) {
    errors.password = "Password must be at least 12 characters and include upper, lower, number, and symbol";
  }
  if (!confirmPassword) {
    errors.confirmPassword = "Please confirm your password";
  } else if (password && password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  if (Object.keys(errors).length) {
    return res.status(422).json({ error: "Validation failed", details: errors });
  }

  try {
    await ensurePasswordResetTable();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [rows] = await pool.query(
      "SELECT account_id FROM password_resets WHERE token_hash = ? AND expires_at > NOW() LIMIT 1",
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(400).json({ error: "Reset link is invalid or has expired" });
    }

    const accountId = rows[0].account_id;
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query("UPDATE accounts SET password = ?, updated_at = NOW() WHERE account_id = ?", [passwordHash, accountId]);
    await pool.query("DELETE FROM password_resets WHERE account_id = ?", [accountId]);

    return res.json({ message: "Password has been reset" });
  } catch (err) {
    console.error("Failed to reset password", err);
    return res.status(500).json({ error: "Unable to reset password" });
  }
}

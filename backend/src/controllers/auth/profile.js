import bcrypt from "bcryptjs";

import { pool } from "../../mysql.js";
import {
  ALLOWED_GENDERS,
  COUNTRY_PATTERN,
  currentUserFromSession,
  normalizeOptional,
  parseDateOfBirth,
  isValidPassword,
} from "../../utils/auth.js";

export async function getProfile(req, res) {
  const user = currentUserFromSession(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  try {
    const [rows] = await pool.query(
      "SELECT account_id, username, email, gender, date_of_birth, country_of_origin, age, created_at, updated_at FROM accounts WHERE account_id = ? LIMIT 1",
      [user.account_id]
    );

    if (!rows.length) return res.status(404).json({ error: "Profile not found" });

    res.json({ profile: rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to load profile" });
  }
}

export async function updateProfile(req, res) {
  const sessionUser = currentUserFromSession(req);
  if (!sessionUser) return res.status(401).json({ error: "Not authenticated" });

  const {
    email: rawEmail,
    gender: rawGender,
    date_of_birth: rawDob,
    country_of_origin: rawCountry,
    password: rawPassword,
    confirmPassword: rawConfirmPassword,
    confirm: rawConfirm,
  } = req.body || {};

  const requestedEmail = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : null;
  const gender = normalizeOptional(rawGender);
  const country_of_origin = normalizeOptional(rawCountry);
  const dobCheck = parseDateOfBirth(normalizeOptional(rawDob));
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const confirmPassword = typeof rawConfirmPassword === "string" ? rawConfirmPassword : typeof rawConfirm === "string" ? rawConfirm : "";

  const errors = {};

  if (gender && !ALLOWED_GENDERS.has(gender)) {
    errors.gender = "Gender selection is invalid";
  }

  if (dobCheck.error) {
    errors.date_of_birth = dobCheck.error;
  }

  if (country_of_origin && !COUNTRY_PATTERN.test(country_of_origin)) {
    errors.country_of_origin = "Country must contain letters, spaces, apostrophes, periods, or hyphens";
  }

  const wantsPasswordChange = Boolean(password || confirmPassword);
  if (wantsPasswordChange) {
    if (!password) {
      errors.password = "New password is required";
    } else if (!isValidPassword(password)) {
      errors.password = "Password must be at least 12 characters and include upper, lower, number, and symbol";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your new password";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
  }

  if (Object.keys(errors).length) {
    return res.status(422).json({ error: "Validation failed", details: errors });
  }

  try {
    const [existingRows] = await pool.query(
      "SELECT account_id, email, password FROM accounts WHERE account_id = ? LIMIT 1",
      [sessionUser.account_id]
    );
    if (!existingRows.length) return res.status(404).json({ error: "Profile not found" });
    const existing = existingRows[0];

    const currentEmail = existing.email?.toLowerCase() || "";
    if (requestedEmail && requestedEmail !== currentEmail) {
      return res.status(403).json({ error: "Email cannot be changed" });
    }

    let passwordHash = null;
    if (wantsPasswordChange) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const age = dobCheck.value ? dobCheck.age ?? null : null;

    const setClauses = [
      "gender = ?",
      "date_of_birth = ?",
      "country_of_origin = ?",
      "age = ?",
    ];
    const values = [
      gender || null,
      dobCheck.value || null,
      country_of_origin || null,
      age,
    ];

    if (passwordHash) {
      setClauses.push("password = ?");
      values.push(passwordHash);
    }

    setClauses.push("updated_at = NOW()");

    const sql = `UPDATE accounts SET ${setClauses.join(", ")} WHERE account_id = ?`;
    values.push(sessionUser.account_id);

    await pool.query(sql, values);

    const [updatedRows] = await pool.query(
      "SELECT account_id, username, email, gender, date_of_birth, country_of_origin, age, created_at, updated_at FROM accounts WHERE account_id = ? LIMIT 1",
      [sessionUser.account_id]
    );

    if (!updatedRows.length) return res.status(404).json({ error: "Profile not found" });
    const profile = updatedRows[0];

    req.session.user = { ...sessionUser, email: profile.email };

    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: "Profile update failed" });
  }
}

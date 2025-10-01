import bcrypt from "bcryptjs";
import { pool } from "../../mysql.js";
import {
  RESERVED_USERNAMES,
  USERNAME_PATTERN,
  EMAIL_PATTERN,
  ALLOWED_GENDERS,
  COUNTRY_PATTERN,
  normalizeOptional,
  isValidPassword,
  parseDateOfBirth,
} from "../../utils/auth.js";

export async function register(req, res) {
  const {
    username: rawUsername,
    email: rawEmail,
    password: rawPassword,
    confirmPassword: rawConfirmPassword,
    confirm: rawConfirm,
    gender: rawGender,
    date_of_birth: rawDob,
    country_of_origin: rawCountry,
  } = req.body || {};

  const username = typeof rawUsername === "string" ? rawUsername.trim() : "";
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const confirmPassword = typeof rawConfirmPassword === "string" ? rawConfirmPassword : typeof rawConfirm === "string" ? rawConfirm : "";
  const gender = normalizeOptional(rawGender);
  const country_of_origin = normalizeOptional(rawCountry);
  const dobCheck = parseDateOfBirth(normalizeOptional(rawDob));

  const errors = {};

  if (!username) {
    errors.username = "Username is required";
  } else if (!USERNAME_PATTERN.test(username)) {
    errors.username = "Username must be 3-32 characters using letters, numbers, dots, underscores or hyphens";
  } else if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    errors.username = "Please choose a different username";
  }

  if (!email) {
    errors.email = "Email is required";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Email format is invalid";
  }

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

  if (gender && !ALLOWED_GENDERS.has(gender)) {
    errors.gender = "Gender selection is invalid";
  }

  if (dobCheck.error) {
    errors.date_of_birth = dobCheck.error;
  }

  if (country_of_origin && !COUNTRY_PATTERN.test(country_of_origin)) {
    errors.country_of_origin = "Country must contain letters, spaces, apostrophes, periods, or hyphens";
  }

  if (Object.keys(errors).length) {
    return res.status(422).json({ error: "Validation failed", details: errors });
  }

  try {
    const [existsUser] = await pool.query("SELECT 1 FROM accounts WHERE username = ? LIMIT 1", [username]);
    if (existsUser.length) return res.status(409).json({ error: "Username exists" });
    const [existsEmail] = await pool.query("SELECT 1 FROM accounts WHERE email = ? LIMIT 1", [email]);
    if (existsEmail.length) return res.status(409).json({ error: "Email exists" });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO accounts (email, password, role, gender, username, date_of_birth, country_of_origin, age, created_at, updated_at)
       VALUES (?, ?, 'user', ?, ?, ?, ?, NULL, NOW(), NOW())`,
      [email, hash, gender || null, username, dobCheck.value || null, country_of_origin || null]
    );
    res.status(201).json({ account_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
}

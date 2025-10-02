import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables from .env file at the very top
dotenv.config();

import { init as initDB } from "./mysql.js";
import sessionRouter from "./routes/session.js";
import placesRouter from "./routes/places.js";
import favouritesRouter from "./routes/favourites.js";
import reviewsRouter from "./routes/reviews.js";
import weatherRouter from "./routes/weather.js";

const app = express();
const PORT = process.env.PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me";

// Initialize the database connection pool
initDB({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  connectTimeout: 10000,
  ssl: "Amazon RDS",
});

// --- Serve React Frontend ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../../frontend/dist")));

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"], credentials: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false }
}));

// Re-import pool after initialization for the health check
import { pool } from "./mysql.js";
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", error: String(e) });
  }
});

app.get("/api", (_req, res) => {
  res.json({
    message: "Cloud-2006 API",
    routes: [
      "/api/health",
      "/api/session",
      "/api/places",
      "/api/favourites",
      "/api/reviews",
      "/api/weather",
    ],
  });
});

app.use("/api/session", sessionRouter);
app.use("/api/places", placesRouter);
app.use("/api/favourites", favouritesRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/weather", weatherRouter);

// This "catch-all" route must be defined *after* all your API routes.
// It serves the React app's index.html for any non-API request.
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/dist", "index.html"));
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));
  
app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
  // Diagnostic log to verify environment variables are loaded
  console.log(`Attempting to connect to DB_HOST: ${process.env.DB_HOST || "NOT SET (defaulting to localhost)"}`);
});
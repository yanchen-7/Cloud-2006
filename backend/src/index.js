import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./mysql.js";
import sessionRouter from "./routes/session.js";
import placesRouter from "./routes/places.js";
import favouritesRouter from "./routes/favourites.js";
import reviewsRouter from "./routes/reviews.js";
import weatherRouter from "./routes/weather.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me";

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"], credentials: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", error: String(e) });
  }
});

app.get("/", (_req, res) => {
  res.json({
    message: "Cloud-2006 API server",
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

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.get("/api", (req, res) => {
    res.json({ message: "API is working!" });
  });
  
app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});


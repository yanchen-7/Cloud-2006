import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Sentiment from "sentiment";

import { init as initDB, pool } from "../mysql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../..", ".env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const sentiment = new Sentiment();

const BATCH_SIZE = Number(process.env.SENTIMENT_BATCH_SIZE || 25);
const ANALYSIS_VERSION = Number(process.env.SENTIMENT_ANALYSIS_VERSION || 1);

function clampScore(value) {
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.max(-1, Math.min(1, numeric));
}

function resolveLabel(score) {
  if (score >= 0.15) return "positive";
  if (score <= -0.15) return "negative";
  return "neutral";
}

async function fetchPendingReviews(limit) {
  const [rows] = await pool.query(
    `SELECT place_id, author_name, publish_time, review_text
     FROM review
     WHERE status = 'approved'
       AND deleted_at IS NULL
       AND review_text IS NOT NULL
       AND (sentiment_score IS NULL OR sentiment_label IS NULL OR analysis_version IS NULL OR analysis_version < ?)
     ORDER BY publish_time ASC
     LIMIT ?`,
    [ANALYSIS_VERSION, limit]
  );
  return rows;
}

async function updateReviewSentiment(row, analysis) {
  await pool.query(
    `UPDATE review
       SET sentiment_score = ?, sentiment_label = ?, analysis_version = ?, last_scored_at = NOW()
     WHERE place_id = ? AND publish_time = ? AND author_name <=> ? AND review_text = ?
     LIMIT 1`,
    [analysis.score, analysis.label, ANALYSIS_VERSION, row.place_id, row.publish_time, row.author_name ?? null, row.review_text]
  );
}

async function processBatch() {
  const rows = await fetchPendingReviews(BATCH_SIZE);
  if (!rows.length) {
    console.log("No reviews awaiting sentiment analysis.");
    return 0;
  }

  for (const row of rows) {
    const text = typeof row.review_text === "string" ? row.review_text.trim() : "";
    const result = sentiment.analyze(text);
    const score = clampScore(result.comparative);
    const label = resolveLabel(score);
    await updateReviewSentiment(row, { score, label });
    console.log(`Updated sentiment for place ${row.place_id} (${label}, score: ${score.toFixed(3)})`);
  }
  return rows.length;
}

async function run() {
  const dbConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    namedPlaceholders: true,
    connectTimeout: 10000,
    ssl: process.env.DB_SSL_MODE || "Amazon RDS",
    secretName: process.env.DB_SECRET_NAME,
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  };

  await initDB(dbConfig);
  console.log("Sentiment worker started.");

  let totalProcessed = 0;
  try {
    // Continue running until fewer than the batch size are returned.
    while (true) {
      const processed = await processBatch();
      totalProcessed += processed;
      if (processed < BATCH_SIZE) break;
    }
    console.log(`Sentiment worker completed. Processed ${totalProcessed} review(s).`);
  } catch (err) {
    console.error("Sentiment worker failed:", err);
    process.exitCode = 1;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch (err) {
        console.warn("Failed to close DB pool:", err);
      }
    }
  }
}

run();

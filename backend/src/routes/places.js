
import express from "express";
import { pool } from "../mysql.js";
import { exec } from "child_process";

const router = express.Router();

/**
 * Safely parses the opening_hours JSON string from the database.
 * The data is stored as a Python dict repr, so it needs cleaning.
 * @param {string | null | undefined} hoursString
 * @returns {object | null}
 */
function parseOpeningHours(hoursString) {
  if (!hoursString || typeof hoursString !== "string") {
    return null;
  }
  try {
    // Convert Python-style dict string to valid JSON
    const jsonString = hoursString.replace(/'/g, '"').replace(/True/g, "true").replace(/False/g, "false").replace(/None/g, "null");
    return JSON.parse(jsonString);
  } catch (e) {
    return null; // Return null if parsing fails
  }
}

router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      // Align with existing schema in database.txt; alias to keep frontend fields consistent
      `SELECT
         place_id,
         place_name AS name,
         address AS formatted_address,
         address,
         latitude,
         longitude,
         category,
         international_phone_number,
         website,
         opening_hours,
         rating,
         price_level
       FROM business_info`
    );
    // Parse opening_hours for each place
    const places = rows.map(place => ({
      ...place,
      opening_hours: parseOpeningHours(place.opening_hours),
    }));
    res.json(places);
  } catch (e) {
    // Enhanced error logging to capture more details
    console.error("/api/places error:", {
      message: e.message, code: e.code, errno: e.errno, sqlState: e.sqlState
    });
    res.status(500).json({ error: "Failed to fetch places" });
  }
});

router.get("/:placeId", async (req, res) => {
  try {
    const placeId = req.params.placeId;
    const [rows] = await pool.query(
      `SELECT
         place_id,
         place_name AS name,
         address AS formatted_address,
         address,
         latitude,
         longitude,
         category,
         international_phone_number,
         website,
         opening_hours,
         rating,
         price_level
       FROM business_info WHERE place_id = ? LIMIT 1`,
      [placeId]
    );
    if (!rows.length) return res.status(404).json({ error: "Place not found" });

    const placeData = rows[0];
    placeData.opening_hours = parseOpeningHours(placeData.opening_hours);

    const [reviews] = await pool.query(
      // Adapt to the 'review' table schema
      `SELECT place_id, place_name, address, rating, review_text, publish_time, author_name
       FROM review WHERE place_id = ? ORDER BY publish_time DESC`,
      [placeId]
    );
    const [summaryRows] = await pool.query(
      `SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating FROM review WHERE place_id = ? AND rating IS NOT NULL`,
      [placeId]
    );
    const summary = {
      count: Number(summaryRows?.[0]?.total_reviews || 0),
      average: summaryRows?.[0]?.average_rating != null ? Number(summaryRows[0].average_rating) : null,
    };
    const place = { ...placeData, user_reviews: reviews, user_reviews_summary: summary };
    res.json(place);
  } catch (e) {
    console.error(`/api/places/${req.params.placeId} error:`, {
      message: e.message, code: e.code, errno: e.errno, sqlState: e.sqlState
    });
    res.status(500).json({ error: "Failed to fetch place" });
  }
});

router.get("/recommendations", async (_req, res) => {
  // Dynamically build the python command using environment variables
  // This is more secure and portable than hardcoding credentials.
  const command = [
    "python",
    "../prediction.py",
    `--mysql-host ${process.env.DB_HOST}`,
    `--mysql-port ${process.env.DB_PORT}`,
    `--mysql-user ${process.env.DB_USER}`,
    `--mysql-password ${process.env.DB_PASSWORD}`,
    `--mysql-db ${process.env.DB_NAME}`,
    "--mysql-table clicks --mode top --topk 5 --min-reviews 10 --pretty",
  ].join(" ");
  exec(
    command,
    (error, stdout, stderr) => {
      if (error) {
        console.error("Prediction error:", error, stderr);
        return res.status(500).json({ error: "Failed to generate recommendations" });
      }
      try {
        const result = JSON.parse(stdout);
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: "Failed to parse recommendations" });
      }
    }
  );
});

export default router;

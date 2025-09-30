import express from "express";
import { pool } from "../mysql.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { place_id } = req.query;
    if (place_id) {
      const [reviews] = await pool.query(
        // Adapt to the 'review' table schema
        `SELECT place_id, place_name, address, rating, review_text, publish_time, author_name
         FROM review WHERE place_id = ? ORDER BY publish_time DESC`,
        [place_id]
      );
      const [summaryRows] = await pool.query(
        `SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating FROM review WHERE place_id = ? AND rating IS NOT NULL`,
        [place_id]
      );
      return res.json({
        place_id,
        reviews,
        summary: {
          count: Number(summaryRows?.[0]?.total_reviews || 0),
          average: summaryRows?.[0]?.average_rating != null ? Number(summaryRows[0].average_rating) : null,
        },
      });
    }
    // The schema doesn't support fetching reviews by user, so we return an empty array.
    res.json([]);
  } catch (e) {
    console.error("/api/reviews GET error:", e);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { place_id, place_name, address, rating, review_text, author_name } = req.body || {};
    if (!place_id || rating == null || !review_text || !author_name) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    await pool.query(
      "INSERT INTO review (place_id, place_name, address, rating, review_text, publish_time, author_name) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
      [place_id, place_name || null, address || null, rating, review_text, author_name]
    );
    res.status(201).json({ message: "Review added successfully" });
  } catch (e) {
    console.error("/api/reviews POST error:", e);
    res.status(500).json({ error: "Failed to add review" });
  }
});

export default router;

import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/:place_id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM review WHERE place_id = ? ORDER BY publish_time DESC",
      [req.params.place_id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { place_id, place_name, address, rating, review_text, author_name } =
      req.body;
    if (!place_id || !rating || !review_text || !author_name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await pool.query(
      "INSERT INTO review (place_id, place_name, address, rating, review_text, publish_time, author_name) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
      [place_id, place_name, address, rating, review_text, author_name]
    );

    res.json({ message: "Review added successfully" });
  } catch (err) {
    console.error("Insert failed:", err);
    res.status(500).json({ error: "Failed to add review" });
  }
});

export default router;

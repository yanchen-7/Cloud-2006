import express from "express";
import { pool } from "../mysql.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

router.get("/", async (req, res) => {
  try {
    const { place_id } = req.query;
    if (place_id) {
      const [reviews] = await pool.query(
        `SELECT r.review_id, r.account_id, r.place_id, r.rating, r.comment, r.created_at, r.updated_at, a.username
         FROM user_reviews r INNER JOIN accounts a ON a.account_id = r.account_id WHERE r.place_id = ? ORDER BY r.created_at DESC`,
        [place_id]
      );
      const [summaryRows] = await pool.query(
        `SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating FROM user_reviews WHERE place_id = ? AND rating IS NOT NULL`,
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
    if (!req.session.user) return res.status(401).json({ error: "Authentication required" });
    const accountId = req.session.user.account_id;
    const [rows] = await pool.query(
      `SELECT review_id, account_id, place_id, rating, comment, created_at, updated_at FROM user_reviews WHERE account_id = ? ORDER BY updated_at DESC`,
      [accountId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const accountId = req.session.user.account_id;
    const { place_id, rating, comment } = req.body || {};
    if (!place_id) return res.status(422).json({ error: "place_id is required" });
    let numericRating = rating == null || rating === "" ? null : Number(rating);
    if (numericRating != null && (numericRating < 0 || numericRating > 5)) {
      return res.status(422).json({ error: "Rating must be between 0 and 5" });
    }
    const text = typeof comment === "string" && comment.trim() !== "" ? comment.trim() : null;
    const [existing] = await pool.query(
      `SELECT review_id FROM user_reviews WHERE account_id = ? AND place_id = ? LIMIT 1`,
      [accountId, place_id]
    );
    let reviewId;
    if (existing.length) {
      await pool.query(
        `UPDATE user_reviews SET rating = ?, comment = ?, updated_at = NOW() WHERE review_id = ?`,
        [numericRating, text, existing[0].review_id]
      );
      reviewId = existing[0].review_id;
    } else {
      const [result] = await pool.query(
        `INSERT INTO user_reviews (account_id, place_id, rating, comment, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [accountId, place_id, numericRating, text]
      );
      reviewId = result.insertId;
    }
    const [reviewRows] = await pool.query(
      `SELECT r.review_id, r.account_id, r.place_id, r.rating, r.comment, r.created_at, r.updated_at, a.username
       FROM user_reviews r INNER JOIN accounts a ON a.account_id = r.account_id WHERE r.review_id = ? LIMIT 1`,
      [reviewId]
    );
    const [summaryRows] = await pool.query(
      `SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating FROM user_reviews WHERE place_id = ? AND rating IS NOT NULL`,
      [place_id]
    );
    const review = reviewRows[0];
    review.summary = {
      count: Number(summaryRows?.[0]?.total_reviews || 0),
      average: summaryRows?.[0]?.average_rating != null ? Number(summaryRows[0].average_rating) : null,
    };
    res.status(201).json(review);
  } catch (e) {
    res.status(500).json({ error: "Failed to upsert review" });
  }
});

router.delete("/:reviewId", requireAuth, async (req, res) => {
  try {
    const accountId = req.session.user.account_id;
    const reviewId = Number(req.params.reviewId);
    await pool.query("DELETE FROM user_reviews WHERE review_id = ? AND account_id = ?", [reviewId, accountId]);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: "Failed to delete review" });
  }
});

export default router;


import express from "express";
import { pool } from "../mysql.js";
import { enqueueReview } from "../utils/sqs.js";
import { deleteCacheKeys } from "../cache/redis.js";

const router = express.Router();
const PLACES_LIST_CACHE_KEY = "places:all";

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  return next();
}

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

router.post("/", requireAuth, async (req, res) => {
  const user = req.session.user;
  try {
    const {
      place_id,
      place_name,
      address,
      rating,
      review_text,
    } = req.body || {};

    const numericRating = Number(rating);
    const trimmedReview = typeof review_text === "string" ? review_text.trim() : "";

    if (!place_id || Number.isNaN(numericRating) || trimmedReview.length === 0) {
      return res.status(422).json({ error: "Missing or invalid fields" });
    }

    const clampedRating = Math.min(5, Math.max(1, numericRating));

    const payload = {
      place_id,
      place_name: place_name || null,
      address: address || null,
      rating: clampedRating,
      review_text: trimmedReview,
      author_name: user.username,
      account_id: user.account_id,
      submitted_at: new Date().toISOString(),
    };

    try {
      const queued = await enqueueReview(payload);
      if (queued) {
        deleteCacheKeys(`places:${payload.place_id}`, PLACES_LIST_CACHE_KEY).catch((err) => {
          console.warn("Cache invalidation failed after enqueuing review:", err);
        });
        return res.status(202).json({ message: "Review accepted for processing" });
      }
    } catch (queueError) {
      console.warn("Failed to enqueue review message. Falling back to direct insert.", queueError);
    }

    await pool.query(
      "INSERT INTO review (place_id, place_name, address, rating, review_text, publish_time, author_name) VALUES (?, ?, ?, ?, ?, NOW(), ?)",
      [payload.place_id, payload.place_name, payload.address, payload.rating, payload.review_text, payload.author_name]
    );
    deleteCacheKeys(`places:${payload.place_id}`, PLACES_LIST_CACHE_KEY).catch((err) => {
      console.warn("Cache invalidation failed after direct DB insert:", err);
    });
    res.status(201).json({ message: "Review recorded" });
  } catch (e) {
    console.error("/api/reviews POST error:", e);
    res.status(500).json({ error: "Failed to add review" });
  }
});

export default router;

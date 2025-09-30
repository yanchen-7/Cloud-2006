import express from "express";
import { pool } from "../mysql.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { lat, lng, radius = 10 } = req.query; // radius in km
  try {
    let query;
    let params = [];

    const baseSelect = `
      SELECT
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
    `;

    if (lat && lng) {
      query = `
        ${baseSelect},
          (6371 * acos(
            cos(radians(?)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians(?)) +
            sin(radians(?)) * sin(radians(latitude))
          )) AS distance
        FROM business_info
        HAVING distance < ?
        ORDER BY distance ASC
        LIMIT 25
      `;
      params = [lat, lng, lat, radius];
    } else {
      query = `${baseSelect} FROM business_info ORDER BY rating DESC, place_name ASC LIMIT 25`;
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    console.error("/api/places error:", e);
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

    const [reviews] = await pool.query(
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
    const place = { ...rows[0], reviews: reviews, reviews_summary: summary };
    res.json(place);
  } catch (e) {
    console.error(`/api/places/${req.params.placeId} error:`, e);
    res.status(500).json({ error: "Failed to fetch place" });
  }
});

export default router;

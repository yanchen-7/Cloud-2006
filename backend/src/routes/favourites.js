import express from "express";
import { pool } from "../mysql.js";

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const accountId = req.session.user.account_id;
    const [rows] = await pool.query(
      `SELECT uf.place_id, uf.added_at, b.name, b.place_name, b.formatted_address, b.address, b.latitude, b.longitude, b.category, b.international_phone_number, b.website, b.opening_hours, b.rating, b.price_level
       FROM user_favourites uf INNER JOIN business_info b ON b.place_id = uf.place_id WHERE uf.account_id = ? ORDER BY uf.added_at DESC`,
      [accountId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch favourites" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const { place_id } = req.body || {};
  if (!place_id) return res.status(422).json({ error: "place_id is required" });
  try {
    const accountId = req.session.user.account_id;
    await pool.query("INSERT IGNORE INTO user_favourites (account_id, place_id, added_at) VALUES (?, ?, NOW())", [accountId, place_id]);
    const [rows] = await pool.query(
      `SELECT b.*, (SELECT added_at FROM user_favourites WHERE account_id = ? AND place_id = ? ORDER BY added_at DESC LIMIT 1) AS added_at
       FROM business_info b WHERE b.place_id = ? LIMIT 1`,
      [accountId, place_id, place_id]
    );
    if (!rows.length) return res.status(404).json({ error: "Place not found" });
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Failed to save favourite" });
  }
});

router.delete("/:placeId", requireAuth, async (req, res) => {
  try {
    const accountId = req.session.user.account_id;
    const placeId = req.params.placeId;
    await pool.query("DELETE FROM user_favourites WHERE account_id = ? AND place_id = ?", [accountId, placeId]);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: "Failed to remove favourite" });
  }
});

export default router;


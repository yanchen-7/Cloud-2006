import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { account_id, place_id } = req.body;
    if (!account_id || !place_id) {
      return res.status(400).json({ error: "Missing fields" });
    }

    await pool.query(
      "INSERT INTO user_favourites (account_id, place_id, added_at) VALUES (?, ?, NOW())",
      [account_id, place_id]
    );

    res.json({ message: "Added to favorites" });
  } catch (err) {
    console.error("Insert failed:", err);
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

export default router;

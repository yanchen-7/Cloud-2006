import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM business_info LIMIT 50");
    res.json(rows);
  } catch (err) {
    console.error("Error fetching businesses:", err);
    res.status(500).json({ error: "Failed to fetch businesses" });
  }
});

router.get("/:place_id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM business_info WHERE place_id = ?",
      [req.params.place_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch business" });
  }
});

export default router;

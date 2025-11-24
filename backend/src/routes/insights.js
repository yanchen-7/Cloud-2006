import express from "express";
import { runAthenaQuery } from "../athenaClient.js";
import { pool } from "../mysql.js";

const router = express.Router();

// 1. GET TOP PLACES (With optional Category filter)
router.get("/top", async (req, res) => {
  try {
    const { category } = req.query;

    // STEP 1: Athena Query
    // CHANGE 1: Increased LIMIT from 300 to 10000 to capture ALL potential candidates
    // CHANGE 2: Lowered frequency threshold from 5 to 3 to include niche places
    const sql = `
      SELECT place_id, AVG(avg_sentiment) as nlp_score
      FROM review_keywords
      WHERE sentiment_label = 'positive'
      GROUP BY place_id
      HAVING SUM(frequency) >= 3
      ORDER BY nlp_score DESC
      LIMIT 10000
    `;

    // console.log("📊 Fetching NLP Candidates...");
    const athenaResults = await runAthenaQuery(sql);

    if (!athenaResults.length) {
      return res.json([]);
    }

    let filteredResults = athenaResults;

    // STEP 2: Category Filtering (Efficiently)
    if (category && category !== 'All') {
      // If a category is selected, we ask MySQL for valid IDs first
      const [rows] = await pool.query(
        'SELECT place_id FROM business_info WHERE category = ?',
        [category]
      );
      
      const validIds = new Set(rows.map(r => r.place_id));
      
      // Filter Athena results against this Set
      filteredResults = athenaResults.filter(item => validIds.has(item.place_id));
    }

    // STEP 3: Slice Top 10
    // Now that we have the correct list for the category, take the top 10
    const top10 = filteredResults.slice(0, 10);

    if (top10.length === 0) {
      return res.json([]);
    }

    // STEP 4: Fetch Details for ONLY the Top 10
    const top10Ids = top10.map(p => p.place_id);
    
    const [details] = await pool.query(
      `SELECT place_id, place_name as name, category, rating, address, latitude, longitude 
       FROM business_info 
       WHERE place_id IN (?)`,
      [top10Ids]
    );

    // STEP 5: Merge and Return
    const finalResults = top10.map(nlp => {
      const info = details.find(d => d.place_id === nlp.place_id);
      if (!info) return null;
      return {
        ...info,
        nlp_score: parseFloat(nlp.nlp_score).toFixed(1)
      };
    }).filter(item => item !== null);

    res.json(finalResults);

  } catch (error) {
    console.error("❌ Top 5 API Error:", error);
    res.status(500).json({ error: "Failed to fetch top places" });
  }
});

// 2. GET SPECIFIC PLACE INSIGHTS (Unchanged)
router.get("/:placeId", async (req, res) => {
  try {
    const { placeId } = req.params;

    const sql = `
      SELECT word, frequency, avg_sentiment, sentiment_label
      FROM review_keywords
      WHERE place_id = '${placeId}'
      AND frequency >= 3
      ORDER BY frequency DESC
      LIMIT 50
    `;

    const rows = await runAthenaQuery(sql);

    const positive = rows
      .filter(r => r.sentiment_label === 'positive')
      .slice(0, 5)
      .map(r => ({ word: r.word, count: r.frequency, score: parseFloat(r.avg_sentiment).toFixed(1) }));

    const negative = rows
      .filter(r => r.sentiment_label === 'negative')
      .slice(0, 5)
      .map(r => ({ word: r.word, count: r.frequency, score: parseFloat(r.avg_sentiment).toFixed(1) }));

    res.json({
      place_id: placeId,
      positive_tags: positive,
      negative_tags: negative
    });

  } catch (error) {
    console.error("❌ Insights API Error:", error);
    res.status(500).json({ error: "Failed to load insights" });
  }
});

export default router;
import express from "express";
import { runAthenaQuery } from "../athenaClient.js";
import { pool } from "../mysql.js";

const router = express.Router();

// --- IN-MEMORY CACHE SETUP ---
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 Hours

const insightCache = {};      // Stores the "Top 10" lists
const placeDetailCache = {};  // Stores specific tags for places

// Helper to process raw Athena rows into the generic Tags format
function processTags(rows) {
  const positive = rows
    .filter(r => r.sentiment_label === 'positive')
    .sort((a, b) => b.frequency - a.frequency) // Sort by frequency DESC
    .slice(0, 5)
    .map(r => ({ word: r.word, count: r.frequency, score: parseFloat(r.avg_sentiment).toFixed(1) }));

  const negative = rows
    .filter(r => r.sentiment_label === 'negative')
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5)
    .map(r => ({ word: r.word, count: r.frequency, score: parseFloat(r.avg_sentiment).toFixed(1) }));

  return { positive, negative };
}

// 1. GET TOP PLACES (With Bulk Pre-fetching)
router.get("/top", async (req, res) => {
  try {
    const category = req.query.category || 'All';
    const now = Date.now();

    // A. CHECK CACHE FOR LIST
    const cachedEntry = insightCache[category];
    if (cachedEntry && (now - cachedEntry.time < CACHE_DURATION)) {
      return res.json(cachedEntry.data);
    }

    // B. ATHENA QUERY: Get Top Candidates
    const sql = `
      SELECT place_id, AVG(avg_sentiment) as nlp_score
      FROM review_keywords
      WHERE sentiment_label = 'positive'
      GROUP BY place_id
      HAVING SUM(frequency) >= 3
      ORDER BY nlp_score DESC
      LIMIT 10000
    `;

    const athenaResults = await runAthenaQuery(sql);
    if (!athenaResults.length) return res.json([]);

    let filteredResults = athenaResults;

    // C. MYSQL FILTERING
    if (category && category !== 'All') {
      const [rows] = await pool.query(
        'SELECT place_id FROM business_info WHERE category = ?',
        [category]
      );
      const validIds = new Set(rows.map(r => r.place_id));
      filteredResults = athenaResults.filter(item => validIds.has(item.place_id));
    }

    // D. SLICE TOP 10
    const top10 = filteredResults.slice(0, 10);
    if (top10.length === 0) return res.json([]);
    const top10Ids = top10.map(p => p.place_id);

    // --- NEW: E. BULK FETCH DETAILS (Eager Loading) ---
    // We fetch tags for ALL 10 places in one go, so clicks are free later.
    try {
      // Create a string like: 'id1', 'id2', 'id3'
      const idString = top10Ids.map(id => `'${id}'`).join(", ");
      
      const bulkSql = `
        SELECT place_id, word, frequency, avg_sentiment, sentiment_label
        FROM review_keywords
        WHERE place_id IN (${idString})
        AND frequency >= 3
      `;
      
      // Run the query (Cost: 1 Athena Scan for all 10 items)
      const bulkRows = await runAthenaQuery(bulkSql);

      // Group rows by place_id in memory
      const rowsByPlace = {};
      bulkRows.forEach(row => {
        if (!rowsByPlace[row.place_id]) rowsByPlace[row.place_id] = [];
        rowsByPlace[row.place_id].push(row);
      });

      // Save each place to placeDetailCache
      top10Ids.forEach(placeId => {
        const placeRows = rowsByPlace[placeId] || [];
        const { positive, negative } = processTags(placeRows);
        
        placeDetailCache[placeId] = {
          time: now,
          data: {
            place_id: placeId,
            positive_tags: positive,
            negative_tags: negative
          }
        };
      });
      // console.log("✅ Bulk cached details for top 10 places");

    } catch (bulkErr) {
      console.warn("⚠️ Bulk fetch failed, individual clicks will query manually.", bulkErr);
    }
    // ---------------------------------------------------

    // F. FETCH BASIC INFO (MySQL) & RETURN LIST
    const [details] = await pool.query(
      `SELECT place_id, place_name as name, category, rating, address, latitude, longitude 
       FROM business_info 
       WHERE place_id IN (?)`,
      [top10Ids]
    );

    const finalResults = top10.map(nlp => {
      const info = details.find(d => d.place_id === nlp.place_id);
      if (!info) return null;
      return {
        ...info,
        nlp_score: parseFloat(nlp.nlp_score).toFixed(1)
      };
    }).filter(item => item !== null);

    // G. SAVE LIST TO CACHE
    insightCache[category] = { time: now, data: finalResults };

    res.json(finalResults);

  } catch (error) {
    console.error("❌ Top API Error:", error);
    res.status(500).json({ error: "Failed to fetch top places" });
  }
});

// 2. GET SPECIFIC PLACE INSIGHTS
// (This is now a fallback. It should almost always hit the cache if the place was in the Top 10)
router.get("/:placeId", async (req, res) => {
  try {
    const { placeId } = req.params;
    const now = Date.now();

    // A. Check Cache
    const cachedPlace = placeDetailCache[placeId];
    if (cachedPlace && (now - cachedPlace.time < CACHE_DURATION)) {
      return res.json(cachedPlace.data);
    }

    // B. Fallback Athena Query (Only if not pre-fetched)
    const sql = `
      SELECT word, frequency, avg_sentiment, sentiment_label
      FROM review_keywords
      WHERE place_id = '${placeId}'
      AND frequency >= 3
      ORDER BY frequency DESC
      LIMIT 50
    `;

    const rows = await runAthenaQuery(sql);
    const { positive, negative } = processTags(rows);

    const responseData = {
      place_id: placeId,
      positive_tags: positive,
      negative_tags: negative
    };

    // C. Save to Cache
    placeDetailCache[placeId] = { time: now, data: responseData };

    res.json(responseData);

  } catch (error) {
    console.error("❌ Insights API Error:", error);
    res.status(500).json({ error: "Failed to load insights" });
  }
});

export default router;
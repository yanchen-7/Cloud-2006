import express from "express";
import { runAthenaQuery } from "../athenaClient.js";
import { pool } from "../mysql.js";
import { getJson, setJson } from "../cache/redis.js";

const router = express.Router();

// 🔴 CHANGE THIS KEY to force a refresh of the cache
const CACHE_KEY_ALL = "INSIGHTS_TOP_ALL_CATEGORIES_V2"; 
const CACHE_TTL = 24 * 60 * 60; // 24 Hours

function processTags(rows) {
  const format = (list) => list.sort((a, b) => b.frequency - a.frequency).slice(0, 5)
    .map(r => ({ word: r.word, count: r.frequency, score: parseFloat(r.avg_sentiment).toFixed(1) }));

  return {
    positive: format(rows.filter(r => r.sentiment_label === 'positive')),
    negative: format(rows.filter(r => r.sentiment_label === 'negative'))
  };
}

// --- GENERATOR FUNCTION ---
async function generateAllInsights() {
  console.log("🔄 [Generator] Starting Full Insight Refresh...");

  // 1. ATHENA: Get global scores
  const sql = `
    SELECT place_id, AVG(avg_sentiment) as nlp_score
    FROM review_keywords
    WHERE sentiment_label = 'positive'
    GROUP BY place_id
    HAVING SUM(frequency) >= 3
    ORDER BY nlp_score DESC
    LIMIT 2000
  `;
  const athenaResults = await runAthenaQuery(sql);
  
  if (!athenaResults.length) {
    console.log("⚠️ [Generator] Athena returned 0 rows.");
    return {};
  }

  const placeIds = athenaResults.map(p => p.place_id);

  // 2. MYSQL: Get details
  const [details] = await pool.query(
    `SELECT place_id, place_name as name, category, rating, address, latitude, longitude 
     FROM business_info 
     WHERE place_id IN (?)`,
    [placeIds]
  );

  // 3. MERGE & BUCKET
  const categoryBuckets = { "All": [] }; 
  const scoreMap = new Map(athenaResults.map(i => [i.place_id, parseFloat(i.nlp_score).toFixed(1)]));

  details.forEach(place => {
    const score = scoreMap.get(place.place_id);
    const enrichedPlace = { ...place, nlp_score: score };
    
    categoryBuckets["All"].push(enrichedPlace);
    if (place.category) {
      if (!categoryBuckets[place.category]) categoryBuckets[place.category] = [];
      categoryBuckets[place.category].push(enrichedPlace);
    }
  });

  // 4. TRIM TO TOP 10
  const allWinningIds = new Set();
  Object.keys(categoryBuckets).forEach(cat => {
    categoryBuckets[cat].sort((a, b) => b.nlp_score - a.nlp_score);
    categoryBuckets[cat] = categoryBuckets[cat].slice(0, 10);
    categoryBuckets[cat].forEach(p => allWinningIds.add(p.place_id));
  });

  // 5. BULK FETCH TAGS & PRE-WARM
  if (allWinningIds.size > 0) {
    try {
      console.log(`⚡ [Generator] Fetching tags for ${allWinningIds.size} places...`);
      const idList = Array.from(allWinningIds).map(id => `'${id}'`).join(", ");
      
      const tagSql = `
        SELECT place_id, word, frequency, avg_sentiment, sentiment_label
        FROM review_keywords
        WHERE place_id IN (${idList}) AND frequency >= 3
      `;
      const tagRows = await runAthenaQuery(tagSql);
      
      const tagsByPlace = {};
      tagRows.forEach(row => {
        if (!tagsByPlace[row.place_id]) tagsByPlace[row.place_id] = [];
        tagsByPlace[row.place_id].push(row);
      });

      // --- 🔥 PRE-WARM LOOP ---
      const redisPromises = [];
      Object.keys(tagsByPlace).forEach(placeId => {
        const rawTags = tagsByPlace[placeId];
        const { positive, negative } = processTags(rawTags);
        const detailData = { place_id: placeId, positive_tags: positive, negative_tags: negative };

        // Log the first few to ensure keys match
        if (redisPromises.length < 3) console.log(`   -> Pre-warming key: INSIGHTS_DETAIL_${placeId}`);

        redisPromises.push(setJson(`INSIGHTS_DETAIL_${placeId}`, detailData, CACHE_TTL));
      });

      await Promise.all(redisPromises);
      console.log(`✅ [Generator] Successfully pre-warmed ${redisPromises.length} keys.`);

      // Attach to main list
      Object.keys(categoryBuckets).forEach(cat => {
        categoryBuckets[cat] = categoryBuckets[cat].map(place => {
            const rawTags = tagsByPlace[place.place_id] || [];
            const { positive, negative } = processTags(rawTags);
            return { ...place, positive_tags: positive, negative_tags: negative };
        });
      });

    } catch (e) {
      console.error("❌ [Generator] Tag fetch failed:", e);
    }
  }

  return categoryBuckets;
}


// --- ROUTES ---

router.get("/top", async (req, res) => {
  try {
    const category = req.query.category || 'All';
    
    // Check Redis for Master List
    let masterCache = await getJson(CACHE_KEY_ALL);

    if (!masterCache) {
      console.log("❄️ [Top API] Cache Miss (Master). Generating...");
      masterCache = await generateAllInsights();
      await setJson(CACHE_KEY_ALL, masterCache, CACHE_TTL);
    } else {
      console.log("🔥 [Top API] Cache Hit (Master).");
    }

    const result = masterCache[category] || [];
    res.json(result);

  } catch (error) {
    console.error("❌ Top API Error:", error);
    res.status(500).json({ error: "Failed to fetch top places" });
  }
});

router.get("/:placeId", async (req, res) => {
  try {
    const { placeId } = req.params;
    const cacheKey = `INSIGHTS_DETAIL_${placeId}`;
    
    // Check Redis for Individual Place
    const cached = await getJson(cacheKey);

    if (cached) {
      console.log(`🔥 [Detail API] Cache HIT for ${placeId}`);
      return res.json(cached);
    }

    // IF WE REACH HERE, IT MEANS ATHENA RUNS (S3 +2 files)
    console.log(`❄️ [Detail API] Cache MISS for ${placeId} -> Querying Athena`);
    
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
    const responseData = { place_id: placeId, positive_tags: positive, negative_tags: negative };

    await setJson(cacheKey, responseData, CACHE_TTL);
    res.json(responseData);

  } catch (error) {
    console.error("❌ Insights API Error:", error);
    res.status(500).json({ error: "Failed to load insights" });
  }
});

export default router;
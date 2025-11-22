import express from "express";
import { pool } from "../mysql.js";
import { getJson as getCachedJson, setJson as setCachedJson } from "../cache/redis.js";

const router = express.Router();

const DEFAULT_LIST_TTL = 300;
const DEFAULT_DETAIL_TTL = 120;
const DEFAULT_LIST_QUERY_TIMEOUT_MS = 10000;
const DEFAULT_DETAIL_QUERY_TIMEOUT_MS = 8000;
const DEFAULT_CLICKS_QUERY_TIMEOUT_MS = 5000;
const DEFAULT_PLACE_REVIEWS_LIMIT = 50;
const MYSQL_BAD_FIELD_ERROR = "ER_BAD_FIELD_ERROR";

function resolveTtl(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function resolveNumber(
  value,
  fallback,
  { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}
) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return Math.floor(clamped);
}

const listTtl = resolveTtl(process.env.PLACES_CACHE_TTL_SECONDS, DEFAULT_LIST_TTL);
const detailTtl = resolveTtl(process.env.PLACE_CACHE_TTL_SECONDS, DEFAULT_DETAIL_TTL);
const listQueryTimeoutMs = resolveNumber(
  process.env.PLACES_QUERY_TIMEOUT_MS,
  DEFAULT_LIST_QUERY_TIMEOUT_MS,
  { min: 500, max: 60000 }
);
const detailQueryTimeoutMs = resolveNumber(
  process.env.PLACE_QUERY_TIMEOUT_MS,
  DEFAULT_DETAIL_QUERY_TIMEOUT_MS,
  { min: 500, max: 60000 }
);
const clicksQueryTimeoutMs = resolveNumber(
  process.env.PLACE_CLICKS_QUERY_TIMEOUT_MS,
  DEFAULT_CLICKS_QUERY_TIMEOUT_MS,
  { min: 250, max: 60000 }
);
const placeReviewsLimit = resolveNumber(
  process.env.PLACE_REVIEWS_LIMIT,
  DEFAULT_PLACE_REVIEWS_LIMIT,
  { min: 10, max: 500 }
);

const LIST_CACHE_KEY = "places:all";
const PLACE_DETAIL_LOG_PREFIX = "/api/places";
const DAILY_TOP_CACHE_KEY = "places:daily-top5:yesterday";

function withQueryTimeout(sql, timeoutMs) {
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return { sql, timeout: timeoutMs };
  }
  return sql;
}

/**
 * Fetch reviews matching the specific Cloud-2006 database structure.
 * CORRECTED: rating (singular), sentiment_label, deleted_at, NO status column.
 */
async function fetchPlaceReviews(placeId, limit) {
  const reviewsSql = `
    SELECT 
      place_id, 
      place_name, 
      address, 
      rating, 
      review_text, 
      publish_time, 
      author_name, 
      sentiment_label
    FROM review
    WHERE place_id = ? 
      AND (deleted_at IS NULL OR deleted_at = '')
    ORDER BY publish_time DESC
    LIMIT ${limit}`;

  const summarySql = `
    SELECT 
      COUNT(*) AS total_reviews, 
      AVG(rating) AS average_rating
    FROM review
    WHERE place_id = ? 
      AND rating IS NOT NULL 
      AND (deleted_at IS NULL OR deleted_at = '')`;

  try {
    const [reviewsRows] = await pool.query(
      withQueryTimeout(reviewsSql, detailQueryTimeoutMs),
      [placeId]
    );
    const [summaryRows] = await pool.query(
      withQueryTimeout(summarySql, detailQueryTimeoutMs),
      [placeId]
    );
    return { reviewsRows, summaryStats: summaryRows?.[0] ?? {} };
  } catch (err) {
    console.error("Failed to fetch reviews:", err);
    // Return empty result instead of crashing
    return { reviewsRows: [], summaryStats: {} };
  }
}

/**
 * Safely parses the opening_hours JSON string from the database.
 */
function parseOpeningHours(hoursString) {
  if (!hoursString || typeof hoursString !== "string") {
    return null;
  }
  try {
    const jsonString = hoursString
      .replace(/'/g, '"')
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b/g, "null");
    return JSON.parse(jsonString);
  } catch (e) {
    return null;
  }
}

router.get("/", async (_req, res) => {
  try {
    const cachedPlaces = await getCachedJson(LIST_CACHE_KEY);
    if (cachedPlaces) {
      return res.json(cachedPlaces);
    }

    const [rows] = await pool.query(
      withQueryTimeout(
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
       FROM business_info`,
        listQueryTimeoutMs
      )
    );

    const places = rows.map((place) => ({
      ...place,
      opening_hours: parseOpeningHours(place.opening_hours),
    }));

    if (listTtl > 0) {
      await setCachedJson(LIST_CACHE_KEY, places, listTtl);
    }
    res.json(places);
  } catch (e) {
    console.error("/api/places error:", {
      message: e.message,
      code: e.code,
      errno: e.errno,
      sqlState: e.sqlState,
    });
    res.status(500).json({ error: "Failed to fetch places" });
  }
});

router.get("/daily-top5", async (_req, res) => {
  try {
    const cached = await getCachedJson(DAILY_TOP_CACHE_KEY);
    if (cached) {
      return res.json(cached);
    }

    let rows;
    try {
      // Primary path: sentiment-based daily top 5 (when schema supports sentiment_score/status)
      [rows] = await pool.query(
        withQueryTimeout(
          `SELECT
             r.place_id,
             b.place_name AS name,
             b.address,
             b.latitude,
             b.longitude,
             b.category,
             b.international_phone_number,
             b.website,
             b.opening_hours,
             b.rating,
             b.price_level,
             AVG(r.sentiment_score) AS avg_sentiment,
             COUNT(*) AS review_count
           FROM review r
           INNER JOIN business_info b
             ON r.place_id COLLATE utf8mb4_unicode_ci =
                b.place_id COLLATE utf8mb4_unicode_ci
           WHERE r.status = 'approved'
             AND r.deleted_at IS NULL
             AND r.sentiment_score IS NOT NULL
             AND DATE(r.publish_time) = (
               SELECT MAX(DATE(publish_time))
               FROM review
               WHERE status = 'approved'
                 AND deleted_at IS NULL
                 AND sentiment_score IS NOT NULL
             )
           GROUP BY r.place_id,
                    name,
                    b.address,
                    b.latitude,
                    b.longitude,
                    b.category,
                    b.international_phone_number,
                    b.website,
                    b.opening_hours,
                    b.rating,
                    b.price_level
           HAVING review_count > 0
           ORDER BY avg_sentiment DESC, review_count DESC
           LIMIT 5`,
          listQueryTimeoutMs
        )
      );
    } catch (err) {
      if (err?.code === "ER_BAD_FIELD_ERROR") {
        // Fallback: schema without sentiment_score/status -> use latest-day rating/count only
        [rows] = await pool.query(
          withQueryTimeout(
            `SELECT
               r.place_id,
               b.place_name AS name,
               b.address,
               b.latitude,
               b.longitude,
               b.category,
               b.international_phone_number,
               b.website,
               b.opening_hours,
               b.rating,
               b.price_level,
               NULL AS avg_sentiment,
               COUNT(*) AS review_count
             FROM review r
             INNER JOIN business_info b
               ON r.place_id COLLATE utf8mb4_unicode_ci =
                  b.place_id COLLATE utf8mb4_unicode_ci
             WHERE (r.deleted_at IS NULL OR r.deleted_at = '')
               AND DATE(r.publish_time) = (
                 SELECT MAX(DATE(publish_time))
                 FROM review
                 WHERE (deleted_at IS NULL OR deleted_at = '')
               )
             GROUP BY r.place_id,
                      name,
                      b.address,
                      b.latitude,
                      b.longitude,
                      b.category,
                      b.international_phone_number,
                      b.website,
                      b.opening_hours,
                      b.rating,
                      b.price_level
             HAVING review_count > 0
             ORDER BY b.rating DESC, review_count DESC
             LIMIT 5`,
            listQueryTimeoutMs
          )
        );
      } else {
        throw err;
      }
    }

    const results = rows.map((row, index) => ({
      rank: index + 1,
      avg_sentiment:
        row.avg_sentiment != null ? Number(row.avg_sentiment) : null,
      review_count: Number(row.review_count || 0),
      place: {
        place_id: row.place_id,
        name: row.name,
        formatted_address: row.address,
        address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
        category: row.category,
        international_phone_number: row.international_phone_number,
        website: row.website,
        opening_hours: parseOpeningHours(row.opening_hours),
        rating: row.rating,
        price_level: row.price_level,
      },
    }));

    if (listTtl > 0) {
      await setCachedJson(DAILY_TOP_CACHE_KEY, results, listTtl);
    }

    res.json(results);
  } catch (e) {
    console.error("/api/places/daily-top5 error:", e);
    res.status(500).json({ error: "Failed to fetch daily top 5 places" });
  }
});

router.get("/recommendations", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      withQueryTimeout(
        `SELECT
         c.place_id,
         COUNT(*) AS clicks,
         b.place_name AS name,
         b.address,
         b.latitude,
         b.longitude,
         b.category,
         b.international_phone_number,
         b.website,
         b.opening_hours,
         b.rating,
         b.price_level
       FROM clicks c
       INNER JOIN business_info b
         ON c.place_id COLLATE utf8mb4_unicode_ci =
            b.place_id COLLATE utf8mb4_unicode_ci
       GROUP BY c.place_id, b.place_name, b.address, b.latitude, b.longitude,
                b.category, b.international_phone_number, b.website,
                b.opening_hours, b.rating, b.price_level
       ORDER BY clicks DESC
       LIMIT 5`,
        listQueryTimeoutMs
      )
    );

    const results = rows.map((row, index) => ({
      rank: index + 1,
      score: Number(row.clicks),
      place: {
        place_id: row.place_id,
        name: row.name,
        formatted_address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
        category: row.category,
        international_phone_number: row.international_phone_number,
        website: row.website,
        opening_hours: parseOpeningHours(row.opening_hours),
        rating: row.rating,
        price_level: row.price_level,
      },
    }));

    res.json(results);
  } catch (e) {
    console.error("/api/places/recommendations error:", e);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

function pushClickRecord({ req, placeId, page, element, deviceType }) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
  const accountId = req.session?.user?.account_id ?? 0;
  const clickedAt = Math.floor(Date.now() / 1000);
  return pool.query(
    withQueryTimeout(
      `INSERT INTO clicks (place_id, account_id, page, element, device_type, ip_address, clicked_at)
       VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
      clicksQueryTimeoutMs
    ),
    [placeId, accountId, page || null, element || null, deviceType || null, ip, clickedAt]
  );
}

async function logClick(req, res) {
  const data = req.method === "GET" ? req.query : req.body;
  const { place_id: placeId, page, element, device_type: deviceType } =
    data || {};
  if (!placeId) return res.status(400).json({ error: "place_id is required" });

  try {
    await pushClickRecord({ req, placeId, page, element, deviceType });
    res.status(req.method === "GET" ? 200 : 201).json({ ok: true });
  } catch (e) {
    console.error("/api/places/clicks error:", e);
    res.status(500).json({ error: "Failed to log click" });
  }
}

router.post("/clicks", logClick);
router.get("/clicks/log", logClick);

router.get("/:placeId/clicks", async (req, res) => {
  const placeId = req.params.placeId;
  const limit = resolveNumber(req.query.limit, 20, { min: 1, max: 200 });
  try {
    const [[metrics]] = await pool.query(
      withQueryTimeout(
        `SELECT COUNT(*) AS total_clicks
         FROM clicks
         WHERE place_id = ?`,
        clicksQueryTimeoutMs
      ),
      [placeId]
    );

    const clicksSql = `SELECT
           place_id,
           account_id,
           page,
           element,
           device_type,
           clicked_at
         FROM clicks
         WHERE place_id = ?
         ORDER BY clicked_at DESC
         LIMIT ${limit}`;

    const [rows] = await pool.query(
      withQueryTimeout(clicksSql, clicksQueryTimeoutMs),
      [placeId]
    );

    const clicks = rows.map((row) => ({
      place_id: row.place_id,
      account_id: Number(row.account_id ?? 0),
      page: row.page,
      element: row.element,
      device_type: row.device_type,
      clicked_at:
        row.clicked_at instanceof Date
          ? row.clicked_at.toISOString()
          : row.clicked_at,
    }));

    res.json({
      place_id: placeId,
      total: Number(metrics?.total_clicks || 0),
      returned: clicks.length,
      limit,
      clicks,
    });
  } catch (e) {
    console.error(`/api/places/${placeId}/clicks error:`, e);
    res.status(500).json({ error: "Failed to fetch logged clicks" });
  }
});

router.get("/:placeId", async (req, res) => {
  const started = Date.now();
  try {
    const placeId = req.params.placeId;
    const cacheKey = `places:${placeId}`;
    
    // --- TEMPORARILY DISABLED CACHE TO FORCE REFRESH ---
    // We commented this out so the server asks the database directly
    /*
    const cachedPlace = await getCachedJson(cacheKey);
    if (cachedPlace) {
      return res.json(cachedPlace);
    }
    */
    // ----------------------------------------------------

    const [rows] = await pool.query(
      withQueryTimeout(
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
        detailQueryTimeoutMs
      ),
      [placeId]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Place not found" });

    const placeRecord = {
      ...rows[0],
      opening_hours: parseOpeningHours(rows[0].opening_hours),
    };

    const { reviewsRows, summaryStats } = await fetchPlaceReviews(
      placeId,
      placeReviewsLimit
    );

    const summary = {
      count: Number(summaryStats.total_reviews || 0),
      average:
        summaryStats.average_rating != null
          ? Number(summaryStats.average_rating)
          : null,
      limit: placeReviewsLimit,
    };

    const place = {
      ...placeRecord,
      user_reviews: reviewsRows,
      user_reviews_summary: summary,
    };

    if (detailTtl > 0) {
      await setCachedJson(cacheKey, place, detailTtl);
    }

    const duration = Date.now() - started;
    if (duration > detailQueryTimeoutMs * 0.9) {
      console.warn(
        `${PLACE_DETAIL_LOG_PREFIX}/${placeId} responded slowly: ${duration}ms`
      );
    }
    res.json(place);
  } catch (e) {
    console.error(`${PLACE_DETAIL_LOG_PREFIX}/${req.params.placeId} error:`, {
      message: e.message,
      code: e.code,
      errno: e.errno,
      sqlState: e.sqlState,
    });
    res.status(500).json({ error: "Failed to fetch place" });
  }
});

export default router;

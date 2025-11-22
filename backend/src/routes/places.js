import express from "express";
import { pool } from "../mysql.js";
import { getJson as getCachedJson, setJson as setCachedJson } from "../cache/redis.js";

const router = express.Router();
let runAthenaQuery = null;
try {
  ({ runAthenaQuery } = await import("../athenaClient.js"));
} catch (err) {
  console.warn(
    "Athena client not loaded; will fall back to DB for daily top 5.",
    err?.message || err
  );
}

const DEFAULT_LIST_TTL = 300;
const DEFAULT_DETAIL_TTL = 120;
const DEFAULT_LIST_QUERY_TIMEOUT_MS = 10000;
const DEFAULT_DETAIL_QUERY_TIMEOUT_MS = 8000;
const DEFAULT_CLICKS_QUERY_TIMEOUT_MS = 5000;
const DEFAULT_PLACE_REVIEWS_LIMIT = 50;
const MYSQL_BAD_FIELD_ERROR = "ER_BAD_FIELD_ERROR";
const ATHENA_DAILY_SCORES_TABLE = sanitizeIdentifier(
  process.env.ATHENA_DAILY_SCORES_TABLE,
  "daily_scores"
);
const DAILY_SCORES_S3_PATH =
  process.env.DAILY_SCORES_S3_PATH ||
  "s3://cloud-2006-bucket-vf6xtl9u/outputs/daily_scores/";
const DAILY_SCORES_S3_MAX_KEYS = 200;
const S3_SELECT_ENABLE = true;

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

function sanitizeIdentifier(value, fallback) {
  const candidate = (value || "").trim();
  if (candidate && /^[A-Za-z0-9_]+$/.test(candidate)) {
    return candidate;
  }
  return fallback;
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

async function buildDailyTopResponse(scoreRows) {
  if (!scoreRows?.length) return [];

  const placeIds = Array.from(
    new Set(
      scoreRows
        .map((row) => row.place_id)
        .filter(Boolean)
    )
  );

  let placeMap = new Map();
  if (placeIds.length) {
    const [placeRows] = await pool.query(
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
         FROM business_info
         WHERE place_id IN (?)`,
        listQueryTimeoutMs
      ),
      [placeIds]
    );
    placeMap = new Map(
      placeRows.map((p) => [p.place_id, { ...p, opening_hours: parseOpeningHours(p.opening_hours) }])
    );
  }

  return scoreRows.map((row, index) => {
    const place = placeMap.get(row.place_id) || {
      place_id: row.place_id,
      name: row.place_id,
      formatted_address: null,
    };
    return {
      rank: index + 1,
      avg_sentiment:
        row.avg_score != null && row.avg_score !== ""
          ? Number(row.avg_score)
          : null,
      review_count: Number(row.review_count || 0),
      place,
    };
  });
}

function parseS3Uri(uri) {
  if (!uri || typeof uri !== "string" || !uri.startsWith("s3://")) {
    throw new Error("Invalid S3 URI");
  }
  const withoutScheme = uri.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  const bucket = slashIndex === -1 ? withoutScheme : withoutScheme.slice(0, slashIndex);
  let prefix = slashIndex === -1 ? "" : withoutScheme.slice(slashIndex + 1);
  if (prefix && !prefix.endsWith("/")) {
    prefix += "/";
  }
  return { bucket, prefix };
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

let s3Client;
let S3ClientCtor;
let ListObjectsV2CommandCtor;
let SelectObjectContentCommandCtor;
let GetObjectCommandCtor;
let ParquetReaderCtor;

async function ensureS3Client() {
  if (
    !S3ClientCtor ||
    !ListObjectsV2CommandCtor ||
    !SelectObjectContentCommandCtor ||
    !GetObjectCommandCtor
  ) {
    const mod = await import("@aws-sdk/client-s3");
    S3ClientCtor = mod.S3Client;
    ListObjectsV2CommandCtor = mod.ListObjectsV2Command;
    SelectObjectContentCommandCtor = mod.SelectObjectContentCommand;
    GetObjectCommandCtor = mod.GetObjectCommand;
  }
  if (!s3Client) {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
    s3Client = new S3ClientCtor({ region });
  }
  return s3Client;
}

async function ensureParquetReader() {
  if (!ParquetReaderCtor) {
    const mod = await import("parquetjs-lite");
    ParquetReaderCtor = mod.ParquetReader || mod.default?.ParquetReader;
  }
  return ParquetReaderCtor;
}

async function getLatestDailyScoresObject() {
  const { bucket, prefix } = parseS3Uri(DAILY_SCORES_S3_PATH);
  const client = await ensureS3Client();

  let continuationToken;
  let latest = null;

  do {
    const resp = await client.send(
      new ListObjectsV2CommandCtor({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: DAILY_SCORES_S3_MAX_KEYS,
      })
    );

    (resp.Contents || [])
      .filter((obj) => obj?.Key?.toLowerCase().endsWith(".parquet"))
      .forEach((obj) => {
        if (!latest || (obj.LastModified && obj.LastModified > latest.LastModified)) {
          latest = obj;
        }
      });

    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  if (!latest?.Key) return null;
  return { bucket, key: latest.Key };
}

async function selectScoresFromS3Object({ bucket, key }) {
  const client = await ensureS3Client();
  const rows = [];

  try {
    const resp = await client.send(
      new SelectObjectContentCommandCtor({
        Bucket: bucket,
        Key: key,
        ExpressionType: "SQL",
        Expression: "SELECT s.location_id, s.ai_score, s.processed_date FROM s3object s",
        InputSerialization: { Parquet: {} },
        OutputSerialization: { JSON: {} },
      })
    );

    let buffer = "";
    for await (const event of resp.Payload) {
      if (event?.Records?.Payload) {
        buffer += event.Records.Payload.toString("utf-8");
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          try {
            rows.push(JSON.parse(part));
          } catch {
            // skip malformed line
          }
        }
      }
    }

    // Handle any trailing buffered line
    if (buffer.trim()) {
      try {
        rows.push(JSON.parse(buffer));
      } catch {
        // ignore
      }
    }
  } catch (err) {
    // Propagate to allow downstream fallback to parquet reader
    throw err;
  }

  return rows;
}

async function computeTop5FromS3() {
  const target = await getLatestDailyScoresObject();
  if (!target) return [];

  let rows = [];

  // Try S3 Select first (fast path)
  try {
    if (S3_SELECT_ENABLE) {
      rows = await selectScoresFromS3Object(target);
    }
  } catch (err) {
    console.warn("/api/places/daily-top5 S3 select failed; will try parquet reader.", err?.message || err);
    rows = [];
  }

  // Fallback to full parquet read if select failed or returned nothing
  if (!rows.length) {
    const client = await ensureS3Client();
    const resp = await client.send(
      new GetObjectCommandCtor({ Bucket: target.bucket, Key: target.key })
    );
    const body = resp.Body;
    if (!body) return [];

    const chunks = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const ParquetReader = await ensureParquetReader();
    if (!ParquetReader) {
      throw new Error("Parquet reader unavailable");
    }

    const reader = await ParquetReader.openBuffer(buffer);
    const cursor = reader.getCursor();
    try {
      let record;
      while ((record = await cursor.next())) {
        rows.push(record);
      }
    } finally {
      await reader.close();
    }
  }

  const dateStrings = rows
    .map((r) => normalizeDateOnly(r.processed_date))
    .filter(Boolean);
  const targetDate = dateStrings.length
    ? dateStrings.reduce((max, curr) => (curr > max ? curr : max), dateStrings[0])
    : null;

  const filtered = targetDate
    ? rows.filter((r) => normalizeDateOnly(r.processed_date) === targetDate)
    : rows;

  const aggregates = new Map();

  for (const row of filtered) {
    const placeId =
      row.location_id ??
      row.place_id ??
      row.locationid ??
      row.locationId ??
      null;
    const score = Number(row.ai_score);
    if (!placeId || !Number.isFinite(score)) continue;

    const entry = aggregates.get(placeId) || { sum: 0, count: 0 };
    entry.sum += score;
    entry.count += 1;
    aggregates.set(placeId, entry);
  }

  const summary = Array.from(aggregates.entries()).map(([place_id, stats]) => ({
    place_id: String(place_id),
    avg_score: stats.count ? stats.sum / stats.count : null,
    review_count: stats.count,
  }));

  return summary
    .sort((a, b) => {
      if (b.avg_score === a.avg_score) {
        return b.review_count - a.review_count;
      }
      return b.avg_score - a.avg_score;
    })
    .slice(0, 5);
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
    if (cached && Array.isArray(cached) && cached.length) {
      return res.json(cached);
    }

    let rows;
    // Primary path: use Athena daily scores grouped by locationid/place_id if available
    if (runAthenaQuery) {
      try {
        const athenaSql = `
          WITH yesterday AS (
            SELECT
              CAST(location_id AS VARCHAR) AS place_id,
              CAST(ai_score AS DOUBLE) AS ai_score
            FROM ${ATHENA_DAILY_SCORES_TABLE}
            WHERE location_id IS NOT NULL
              AND ai_score IS NOT NULL
              AND date(processed_date) = date_add('day', -1, current_date)
          )
          SELECT
            place_id,
            AVG(ai_score) AS avg_score,
            COUNT(*) AS review_count
          FROM yesterday
          GROUP BY place_id
          HAVING COUNT(*) > 0
          ORDER BY avg_score DESC, review_count DESC
          LIMIT 5;
        `;
        const athenaRows = await runAthenaQuery(athenaSql);

        rows = await buildDailyTopResponse(
          (athenaRows || []).map((row) => ({
            place_id: row.place_id,
            avg_score: row.avg_score,
            review_count: row.review_count,
          }))
        );
      } catch (err) {
        console.warn("/api/places/daily-top5 Athena path failed; falling back to DB.", err?.message || err);
      }
    }

    // Secondary path: read latest daily_scores from S3 (via SelectObjectContent) when Athena is blocked
    if (!rows || !rows.length) {
      try {
        const s3Top = await computeTop5FromS3();
        rows = await buildDailyTopResponse(s3Top);
      } catch (err) {
        console.warn("/api/places/daily-top5 S3 fallback failed:", err?.message || err);
      }
    }

    // Fallback to DB if Athena is unavailable or returned nothing
    if (!rows || !rows.length) {
      try {
        [rows] = await pool.query(
          withQueryTimeout(
            `SELECT
               place_id,
               place_name AS name,
               address,
               latitude,
               longitude,
               category,
               international_phone_number,
               website,
               opening_hours,
               rating,
               price_level,
               NULL AS avg_sentiment,
               NULL AS review_count
             FROM business_info
             ORDER BY rating DESC
             LIMIT 5`,
            listQueryTimeoutMs
          )
        );
      } catch (err) {
        console.warn("/api/places/daily-top5 DB fallback failed:", err?.message || err);
        rows = [];
      }
    }

    const hydrated = Array.isArray(rows) && rows.length && rows[0]?.place;
    const results = hydrated
      ? rows.map((row, index) => ({
          rank: row.rank ?? index + 1,
          avg_sentiment:
            row.avg_sentiment != null ? Number(row.avg_sentiment) : null,
          review_count: Number(row.review_count || 0),
          place: {
            ...row.place,
            opening_hours: parseOpeningHours(row.place?.opening_hours),
          },
        }))
      : rows.map((row, index) => ({
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

    if (listTtl > 0 && results.length) {
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

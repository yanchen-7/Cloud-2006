# Cloud-2006

Tourism points-of-interest explorer with an Express API, React/Vite map UI, MySQL source of truth, optional Redis cache, and AWS analytics (Athena, S3, EMR/Spark, SQS) for recommendations and review insights.

## What's here
- React frontend (Leaflet map, daily top list, saved places, authentication, password reset).
- Express backend with session auth, rate limiting, MySQL plus optional AWS Secrets Manager, Redis caching, SQS review queue, Athena/S3 powered insights, click logging, and per-place recommendations.
- Terraform to provision VPC, CloudFront, S3, RDS MySQL, ElastiCache Redis, EC2, EMR/EMR Serverless, EventBridge scheduler, WAF, Secrets Manager, and analytics buckets.
- Data utilities for scraping/cleaning Google Maps reviews and converting JSON/CSV for ML.

## Repository layout
- `backend/` - Express API, Redis cache helpers, Athena/S3 clients, sentiment worker, SQS integration, and optional EMR Serverless trigger (`cloud-automation (NLP)/`).
- `frontend/` - React + Vite client; dev server proxies `/api` to the backend.
- `TerraForm/` - Infrastructure as code for networking, database, cache, storage, CloudFront, EMR (batch recommender), EventBridge schedules, and supporting IAM.
- `singapore_data_with_category.csv` - POI dataset; Python helpers (e.g., `Maps_scraper.py`, `clean_reviews_for_ml.py`) for offline prep.

## Prerequisites
- Node.js 18+ and npm.
- MySQL 8 (or compatible). Redis optional but recommended for caching.
- AWS credentials if you want Athena/S3/SQS/EMR features or to apply Terraform.
- Terraform and AWS CLI configured if you plan to deploy infrastructure.

## Quickstart (local development)
1) **Backend**
```
cd backend
cp .env.example .env        # fill values below
npm install
npm run dev                 # http://localhost:3001/api
```
   - Minimum env: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET`.
   - Optional Redis (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`), AWS settings (`AWS_REGION`, `DB_SECRET_NAME`), SQS (`REVIEW_QUEUE_URL`), Athena/S3 paths for daily top/insights, SMTP for password reset.
   - For production, build the frontend then serve `frontend/dist` via `npm start` in `backend/` (Express already serves the built assets).

2) **Frontend**
```
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxy -> http://localhost:3001/api)
```
   - Production bundle: `npm run build` (outputs to `frontend/dist/`).

3) **Database**
   - Create a database and tables (see "Database schema"). Import `singapore_data_with_category.csv` into `business_info` to populate places.
   - Ensure the MySQL user has permissions for SELECT/INSERT/UPDATE/DELETE on these tables.

4) **Health checks**
```
curl http://localhost:3001/api/health
curl http://localhost:3001/api/places | head
```

## Reproducing the project locally (fresh clone)
```
git clone https://<your-fork>/Cloud-2006.git
cd Cloud-2006

# Backend
cd backend
cp .env.example .env
npm install
npm run dev

# In another terminal
cd ../frontend
npm install
npm run dev
```
- Create the MySQL schema from the SQL in the "Database schema" section, then import `singapore_data_with_category.csv` into `business_info`.
- Ensure Redis is reachable if you enable caching; otherwise the API falls back without caching.
- Visit `http://localhost:5173` (proxy to API on `http://localhost:3001`).

## Deployment (production)
**Application servers**
1. Build the frontend: `cd frontend && npm install && npm run build` (outputs `frontend/dist`).
2. Configure backend env vars for production: DB credentials/secret, `SESSION_SECRET`, `CORS_ORIGIN`, SMTP, Redis, Athena/S3 paths, SQS (optional).
3. Serve API + static build from `backend`: `cd backend && npm install && npm start`. Use a process manager (PM2/systemd) and run behind HTTPS; set `cookie.secure=true` via reverse proxy when possible.
4. Point your reverse proxy (e.g., Nginx/CloudFront) to the backend server, serving `/api/*` to Express and static assets from `frontend/dist`.

**Database and migrations**
- Apply the schema from "Database schema" to MySQL, then load POI data into `business_info`.
- Add indexes as shown; ensure MySQL user has needed privileges. Redis is optional but recommended for performance.

**Infra via Terraform (optional)**
1. Export AWS credentials and select the target workspace/environment.
2. `cd TerraForm && terraform init`
3. Review `terraform.tfvars` (project name, owner, environment, region, instance sizes, schedule flags).
4. `terraform plan` and `terraform apply` to provision VPC, RDS, Redis, S3 buckets, CloudFront/WAF, EMR, EventBridge schedules, and IAM roles.
5. After apply, pull outputs for EMR/Athena/S3 paths and update backend environment variables accordingly.

## Environment variables (backend)
- **Database**: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, optional `DB_SECRET_NAME` (AWS Secrets Manager JSON with `username`/`password`/`host`/`port`/`dbname`), `DB_SSL_MODE` (defaults to `Amazon RDS`).
- **Server**: `PORT` (default `3001`), `SESSION_SECRET`, `CORS_ORIGIN` (comma-separated).
- **Rate limits**: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `PLACES_RATE_LIMIT_WINDOW_MS`, `PLACES_RATE_LIMIT_MAX`.
- **Redis cache**: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_URL`, `REDIS_TLS`.
- **Places caching/tuning**: `PLACES_CACHE_TTL_SECONDS`, `PLACE_CACHE_TTL_SECONDS`, `PLACES_QUERY_TIMEOUT_MS`, `PLACE_QUERY_TIMEOUT_MS`, `PLACE_CLICKS_QUERY_TIMEOUT_MS`, `PLACE_REVIEWS_LIMIT`.
- **Athena/S3 daily scores**: `AWS_REGION`/`AWS_DEFAULT_REGION`, `ATHENA_DB`, `ATHENA_WORKGROUP`, `ATHENA_OUTPUT`, `ATHENA_DAILY_SCORES_TABLE`, `DAILY_SCORES_S3_PATH`, `DAILY_TOP_ATHENA_OUTPUT`.
- **Insights**: uses Athena table `review_keywords`; cached in Redis for 24h.
- **Email + password reset**: `APP_BASE_URL`, optional `PASSWORD_RESET_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- **Queues/analytics**: `REVIEW_QUEUE_URL` (SQS), optional `AWS_REGION` override; sentiment worker uses `SENTIMENT_BATCH_SIZE`, `SENTIMENT_ANALYSIS_VERSION`.

## Database schema (MySQL)
```sql
CREATE TABLE accounts (
  account_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  gender ENUM('Female','Male','Non-binary','Other') NULL,
  date_of_birth DATE NULL,
  country_of_origin VARCHAR(255) NULL,
  age INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE business_info (
  place_id VARCHAR(255) PRIMARY KEY,
  place_name TEXT,
  address TEXT,
  latitude DOUBLE,
  longitude DOUBLE,
  category TEXT,
  international_phone_number TEXT,
  website TEXT,
  opening_hours TEXT,
  rating DOUBLE,
  price_level DOUBLE
);

CREATE TABLE review (
  place_id VARCHAR(255) NOT NULL,
  place_name TEXT,
  address TEXT,
  rating DOUBLE,
  review_text TEXT,
  publish_time DATETIME,
  author_name TEXT,
  account_id INT NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'approved',
  sentiment_score DOUBLE NULL,
  sentiment_label VARCHAR(32) NULL,
  analysis_version INT NULL,
  last_scored_at DATETIME NULL,
  deleted_at DATETIME NULL,
  KEY idx_review_place (place_id)
);

CREATE TABLE user_favourites (
  favourite_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id INT UNSIGNED NOT NULL,
  place_id VARCHAR(255) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_place (account_id, place_id)
);

CREATE TABLE clicks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  place_id VARCHAR(255) NOT NULL,
  account_id INT UNSIGNED DEFAULT 0,
  page VARCHAR(64),
  element VARCHAR(64),
  device_type VARCHAR(64),
  ip_address VARCHAR(64),
  clicked_at DATETIME NOT NULL,
  KEY idx_clicks_place (place_id),
  KEY idx_clicks_time (clicked_at)
);

-- Recommendations produced by Spark/EMR job
CREATE TABLE recommendations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id VARCHAR(255) NOT NULL,
  rec_item_id VARCHAR(255) NOT NULL,
  score DOUBLE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_item (item_id)
);
```
Tables `review_keywords` (Athena) and Parquet files in S3 power the insights/daily-top endpoints; they are populated by the EMR/Serverless jobs described below.

## API map (Express)
- `GET /api/health` - DB connectivity check.
- `GET /api/session` - current session; `POST /login`, `POST /logout`, `POST /register`.
- `GET /api/session/profile`, `PUT /api/session/profile` - load/update profile (auth).
- `POST /api/session/password/forgot`, `POST /api/session/password/reset` - password reset flow.
- `GET /api/places` - list all places; cached in Redis when available.
- `GET /api/places/daily-top5` - yesterday's top 5 by sentiment (Athena/S3), falls back to ratings.
- `GET /api/places/recommendations` - most-clicked places.
- `GET /api/places/:placeId` - place details plus latest reviews and summary.
- `GET /api/places/:placeId/recommendations` - collaborative recommendations from `recommendations` table.
- `POST /api/places/clicks`, `GET /api/places/clicks/log`, `GET /api/places/:placeId/clicks` - click logging and retrieval.
- `GET /api/reviews?place_id=` - reviews for a place; `POST /api/reviews` - add review (auth, enqueues to SQS if configured).
- `GET /api/favourites` (auth), `POST /api/favourites`, `DELETE /api/favourites/:placeId` - saved places.
- `GET /api/weather` - SG 2-hour forecast plus rainfall/PSI/temperature passthrough.
- `GET /api/insights/top?category=` - top places by NLP score (Athena plus Redis cache); `GET /api/insights/:placeId` - positive/negative tags for a place.

Authentication uses cookie-based `express-session`. For production, back sessions with Redis or another store and set `cookie.secure=true` behind HTTPS.

## Background jobs and analytics
- **Sentiment worker**: `cd backend && npm run sentiment:run` batches unscored approved reviews, computes sentiment (lexical), and writes `sentiment_score`, `sentiment_label`, `analysis_version`.
- **SQS review queue**: if `REVIEW_QUEUE_URL` is set, reviews are also pushed to SQS for downstream processing while being inserted into MySQL immediately.
- **Click analytics plus Spark recommender**: `/api/places` endpoints log clicks into MySQL. Terraform includes an EMR-based batch job (see `emr_recommender.tf`, `eventbridge_recommender.tf`) that reads `clicks`, writes `recommendations`, and can be scheduled daily via EventBridge.
- **Daily top 5**: Uses Athena over `ATHENA_DAILY_SCORES_TABLE` or S3 Parquet files (`DAILY_SCORES_S3_PATH`) to compute yesterday's best places by sentiment; caches in Redis.
- **NLP keywords (EMR Serverless)**: `backend/cloud-automation (NLP)/index.mjs` streams reviews to S3 and triggers an EMR Serverless Spark job (`keyword_extractor.py`) to populate `review_keywords` (used by `/api/insights`). Configure `BUCKET_NAME`, `EMR_APP_ID`, `EMR_ROLE_ARN` in the runtime environment.

## Terraform (deployment overview)
- `main.tf`, `dev_vpc.tf`, `security.tf` - VPC, subnets, routing, security groups, internet/NAT gateways.
- `database.tf` - RDS MySQL (prod/dev), Secrets Manager integration.
- `cache.tf` - ElastiCache Redis (prod).
- `s3.tf`, `s3_recommender.tf`, `cloudfront.tf`, `waf.tf` - asset buckets, CloudFront distribution, WAF rules, log retention.
- `serverless.tf`, `lambda_clicks_export.tf`, `endpoints.tf` - Lambda/API Gateway helpers and private link endpoints.
- `emr_recommender.tf`, `eventbridge_recommender.tf`, `iam_emr_recommender.tf`, `jobs/` - EMR cluster, IAM, scheduled Spark step for recommendations; outputs expose cluster name, JDBC secret, and target table.
- `monitoring.tf` - CloudWatch alarms/logging.
- State files are present in this repo; use remote state in a real deployment and review `terraform.tfvars` for project/environment/owner tags.

## Data utilities
- `Maps_scraper.py`, `jsonl_to_csv.py`, `clean_reviews_for_ml.py` - scrape/transform review data.
- `singapore_data_with_category.csv` - seed for `business_info` and CSV export endpoint.

## Troubleshooting
- API unreachable: verify `npm run dev` logs and `DB_HOST` connectivity; `curl http://localhost:3001/api/health` should return `{status:"ok"}`.
- CORS/session issues in dev: ensure the frontend runs on `http://localhost:5173` and `CORS_ORIGIN` includes it; cookies require `credentials: 'include'` (already set in the app).
- Slow `/api/places/*`: check MySQL indexes (`place_id`) and Redis availability; tune `*_QUERY_TIMEOUT_MS` and cache TTLs.
- Password reset email: confirm SMTP settings; in dev, a JSON transport logs the message to the console.

## Common workflows
- Start full stack locally: run backend and frontend dev servers; log in/register, explore the map, save favourites, submit reviews, and view daily top/recommendations.
- Refresh NLP insights: run the EMR Serverless trigger (`cloud-automation (NLP)/index.mjs`) with AWS credentials and bucket/role IDs set.
- Rebuild production bundle: `cd frontend && npm run build`, then `cd backend && npm start` to serve the static build plus API from one process.

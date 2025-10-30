# Cloud-2006

Tourism points-of-interest explorer now ships as a PHP application backed by MySQL. A new Node.js (Express) + React implementation is added alongside PHP; Terraform remains unchanged.

## Getting Started

1. **Provision MySQL** ? create a database and run the migration below to prepare the `users` table:
   ```sql
   CREATE TABLE users (
       id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
       username VARCHAR(80) NOT NULL UNIQUE,
       email VARCHAR(255) NOT NULL UNIQUE,
       password_hash VARCHAR(255) NOT NULL,
       gender VARCHAR(32) NULL,
       date_of_birth DATE NULL,
       mobile_number VARCHAR(64) NULL,
       country_of_origin VARCHAR(128) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   );
   ```
2. **Store credentials** ? create `/var/www/private/db-config.ini` with your connection details:
   ```ini
   host = your-rds-endpoint
   port = 3306
   database = cloud2006
   username = app_user
   password = super_secret_password
   ```
   The file is read with `parse_ini_file`, so keep it accessible to the web user only.
3. **Serve the PHP site** ? from the project root run `php -S localhost:8000` (or deploy behind Apache/Nginx pointing to `index.php`).

## Node.js + React (New)

### Backend (Express)

```
cd backend
cp .env.example .env   # set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, SESSION_SECRET
npm install
npm run dev
# API at http://localhost:3001/api
```

Update `.env` with SMTP_HOST/PORT/USER/PASS (and optional SMTP_FROM, SMTP_SECURE) plus either PASSWORD_RESET_URL or APP_BASE_URL so password reset emails can be delivered with correct links.

### Frontend (React + Vite)

```
cd frontend
npm install
npm run dev
# App at http://localhost:5173 (proxied to /api)
```

## Application Structure

- `index.php` ? front controller handling all routes (`/`, `/explore`, `/login`, `/register`, `/profile`, `/forgot`, `/logout`, `/csv`).
- `includes/` ? shared bootstrap, database, auth, flash messaging, and rendering helpers.
- `templates/` ? PHP view files (`layout.php`, `home.php`, `explore.php`, etc.).
- `static/` ? existing JavaScript, CSS, and assets. `/csv` streams `singapore_data_with_category.csv` for the frontend map components.
- `backend/` ? Express server exposing `/api/session`, `/api/places`, `/api/favourites`, `/api/reviews`, `/api/weather`.
- `frontend/` ? React (Vite) app replicating Home/Explore/Auth/Profile pages.

## Authentication & Profiles

- Registration, login, logout, profile updates, and password changes now run against MySQL.
- Sessions and flash messages are PHP-native; password hashes use `password_hash()`/`password_verify()`. Node uses `express-session` and `bcryptjs`.
- `require_login()` enforces authentication for protected pages (profile, logout).

## Notes

- Legacy Flask code and the local SQLite database have been removed; Python utilities used for data prep are still available in case they are needed offline.
- Ensure your web server prevents direct access to `/var/www/private` while keeping it readable by PHP.
- Update DNS/virtual host rules so that `/static` continues to be served directly to avoid routing through PHP for assets. For Node/React dev, Vite serves assets.

# Big Data Recommendation Engine

This add-on introduces a low-cost, batch recommendation pipeline using Amazon EMR (Hadoop + Spark), S3, EventBridge Scheduler, and Athena.

Data flow:
- S3 `raw/` → EMR Spark job → S3 `curated/recommendations/` (Parquet)
- Athena Workgroup + Table for ad-hoc queries
- EventBridge runs daily at 1 AM SGT (17:00 UTC) and submits the Spark step to EMR

What was added (no changes to existing infra):
- EMR cluster `emr-7.2.0` with Hadoop/Spark
  - Instance Fleets: master On-Demand (1), core on Spot (50% of On-Demand)
  - Public subnet for outbound access
  - Auto-termination after 10 minutes idle
- IAM roles for EMR service/EC2, Scheduler role scoped to AddJobFlowSteps
- S3 prefixes for `raw/`, `curated/`, `curated/recommendations/`, `athena-results/`
- Lifecycle rule to expire `log/` after 30 days on the main bucket
- Athena Workgroup + Database + external table `recommendations`
- PySpark job uploaded to `s3://<main-bucket>/jobs/poi_recommender.py`

Run schedule:
- 01:00 SGT (17:00 UTC): EventBridge calls AddJobFlowSteps to run the Spark job.
  - Important: AddJobFlowSteps requires the EMR cluster to be RUNNING at that time.
  - Because auto-termination is enabled, the cluster will shut down when idle. If it is terminated at 01:00 SGT, the step will fail. Start the cluster beforehand or switch to an ephemeral RunJobFlow schedule.

Manual triggers:
- Start the EMR cluster (if terminated), then submit a one-off step via AWS Console (EMR → your cluster → Steps → Add step) with:
  - Jar: `command-runner.jar`
  - Args: `spark-submit s3://<main-bucket>/jobs/poi_recommender.py --raw s3://<main-bucket>/raw/ --poi s3://<main-bucket>/raw/poi/ --output s3://<main-bucket>/curated/recommendations/ --topn 20`

Outputs to use:
- EMR cluster name: `terraform output recommender_emr_cluster_name`
- Script path: `terraform output recommender_script_s3_path`
- Recommendations prefix: `terraform output recommendations_s3_prefix`
- Athena DB/Table: `terraform output recommender_athena_db`, `terraform output recommender_athena_table`

Cost & scaling notes:
- Core nodes use Spot (50% of On-Demand bid). Adjust `recommender_core_instance_count` and instance types to tune cost.
- Auto-termination is enabled. If you rely on the daily scheduler, ensure the cluster is running at 01:00 SGT or switch to an ephemeral RunJobFlow schedule.
- Athena is for ad-hoc queries only; results stored under `athena-results/`.

Accepted input headers (no need to rename):
- user: `user_id` | `USER_ID` | `account_id` | `ACCOUNT_ID`
- item: `item_id` | `ITEM_ID` | `place_id` | `PLACE_ID`
- timestamp: `timestamp` | `TIMESTAMP` | `clicked_at` | `CLICKED_AT`
- event_type: `event_type` | `EVENT_TYPE` (defaults to `CLICK` if missing)

Tagging:
- All resources tagged with `Project`, `Environment`, `Owner` (from variables `project_name`, `recommender_environment`, `recommender_owner`).


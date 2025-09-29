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

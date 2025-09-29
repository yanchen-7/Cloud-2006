#!/usr/bin/env python3
"""Tourism recommendations sourced from either the local CSV or an AWS MySQL dataset.

By default we keep using ``singapore_data_with_category.csv`` so behaviour stays
aligned with the rest of the repo.  When MySQL credentials are supplied the script
pulls rows from the remote table and applies the same heuristics (rating weighted by
review count) to generate daily, category, or nearby picks.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

try:
    from sklearn.linear_model import LogisticRegression
    import numpy as np
    import pymysql
except ImportError:  # pragma: no cover - optional dependency
    pymysql = None
    LogisticRegression = None
    np = None

DATA_PATH = Path(__file__).with_name("singapore_data_with_category.csv")
EARTH_RADIUS_KM = 6371.0
SAFE_IDENTIFIER_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.")


def validate_identifier(value: str, *, label: str) -> str:
    if not value:
        raise ValueError(f"{label} must not be empty.")
    invalid = set(value) - SAFE_IDENTIFIER_CHARS
    if invalid:
        chars = "".join(sorted(invalid))
        raise ValueError(f"{label} contains unsupported characters: {chars!r}")
    return value


def ensure_optional_file(path: Optional[Path], *, label: str) -> Optional[Path]:
    if path is None:
        return None
    resolved = path.expanduser().resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"{label} file not found: {resolved}")
    return resolved


def coalesce(*values):
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                continue
            return trimmed
        return value
    return None


def resolve_ssl_path(cli_value: Optional[Path], env_name: str, *, label: str) -> Optional[Path]:
    if cli_value is not None:
        return ensure_optional_file(cli_value, label=label)
    env_value = os.getenv(env_name)
    if env_value:
        return ensure_optional_file(Path(env_value), label=label)
    return None


def parse_float(value: object) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_int(value: object) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


@dataclass(frozen=True)

class Place:
    click_id: int
    account_id: int
    page: str
    element: str
    device_type: str
    ip_address: str
    clicked_at: str
    place_id: str

    @classmethod
    def from_row(cls, row: Dict[str, object]) -> "Place":
        return cls(
            click_id=row.get("click_id"),
            account_id=row.get("account_id"),
            page=row.get("page"),
            element=row.get("element"),
            device_type=row.get("device_type"),
            ip_address=row.get("ip_address"),
            clicked_at=str(row.get("clicked_at")),
            place_id=row.get("place_id"),
        )


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def load_places_from_csv(csv_path: Path) -> List[Place]:
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")
    places: List[Place] = []
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            try:
                place = Place.from_row(row)
            except ValueError:
                continue
            places.append(place)
    return places


def load_places_from_mysql(
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
    table: str,
    limit: Optional[int],
    ssl_ca: Optional[Path],
    ssl_cert: Optional[Path],
    ssl_key: Optional[Path],
) -> List[Place]:
    if pymysql is None:
        raise SystemExit("PyMySQL is required for MySQL mode. Install with `pip install PyMySQL`. ")

    ssl_params = None
    if ssl_ca or ssl_cert or ssl_key:
        ssl_params = {}
        if ssl_ca:
            ssl_params["ca"] = str(ssl_ca)
        if ssl_cert:
            ssl_params["cert"] = str(ssl_cert)
        if ssl_key:
            ssl_params["key"] = str(ssl_key)

    table = validate_identifier(table, label="mysql-table")

    query = (
        "SELECT "
        "click_id, "
        "account_id, "
        "page, "
        "element, "
        "device_type, "
        "ip_address, "
        "clicked_at, "
        "place_id "
        f"FROM {table}"
    )
    if limit is not None:
        if limit <= 0:
            raise ValueError("mysql-limit must be a positive integer")
        query += f" LIMIT {int(limit)}"

    connection = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        cursorclass=pymysql.cursors.DictCursor,
        ssl=ssl_params,
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()
    finally:
        connection.close()

    places: List[Place] = []
    for row in rows:
        # Normalise keys to lower-case to match CSV schema expectations.
        normalised = {key.lower(): value for key, value in row.items()}
        try:
            place = Place.from_row(normalised)
        except ValueError:
            continue
        places.append(place)
    return places


def place_score(place: Place) -> float:
    if place.rating is None:
        return 0.0
    weight = 1.0
    if place.rating_count:
        weight += math.log10(max(place.rating_count, 1))
    return place.rating * weight


def sort_places(places: Iterable[Place]) -> List[Place]:
    return sorted(
        places,
        key=lambda p: (
            place_score(p),
            p.rating if p.rating is not None else -math.inf,
            p.rating_count or 0,
        ),
        reverse=True,
    )


def top_places(
    places: Sequence[Place],
    *,
    category: Optional[str],
    topk: int,
    min_reviews: int,
) -> List[Place]:
    filtered = [
        p
        for p in places
        if p.matches_category(category)
        and p.rating is not None
        and (p.rating_count or 0) >= min_reviews
    ]
    return sort_places(filtered)[:topk]


def daily_recommendations(
    places: Sequence[Place],
    *,
    topk: int,
    min_reviews: int,
) -> List[Tuple[str, Place]]:
    buckets: Dict[str, List[Place]] = {}
    for place in places:
        if place.rating is None or (place.rating_count or 0) < min_reviews:
            continue
        buckets.setdefault(place.category, []).append(place)

    picks: List[Tuple[str, Place]] = []
    for category, members in buckets.items():
        ranked = sort_places(members)
        if ranked:
            picks.append((category, ranked[0]))

    picks.sort(key=lambda item: place_score(item[1]), reverse=True)
    return picks[:topk]


def nearest_places(
    places: Sequence[Place],
    *,
    latitude: float,
    longitude: float,
    category: Optional[str],
    topk: int,
    min_reviews: int,
) -> List[Tuple[Place, float]]:
    scored: List[Tuple[Place, float]] = []
    for place in places:
        if not place.matches_category(category):
            continue
        if (place.rating_count or 0) < min_reviews:
            continue
        distance = haversine_km(latitude, longitude, place.latitude, place.longitude)
        scored.append((place, distance))
    scored.sort(key=lambda item: (item[1], -place_score(item[0])))
    return scored[:topk]


def serialize_place(place: Place, *, distance_km: Optional[float] = None) -> Dict[str, object]:
    payload: Dict[str, object] = {
        "place_id": place.place_id,
        "name": place.name,
        "category": place.category,
        "latitude": place.latitude,
        "longitude": place.longitude,
        "rating": place.rating,
        "user_ratings_total": place.rating_count,
        "price_level": place.price_level,
        "formatted_address": place.formatted_address,
        "score": round(place_score(place), 4),
    }
    if distance_km is not None:
        payload["distance_km"] = round(distance_km, 3)
    return payload


def build_output(args: argparse.Namespace, places: Sequence[Place]):

# Recommendation and prediction features
    try:
        from sklearn.linear_model import LogisticRegression
        import numpy as np
    except ImportError:
        LogisticRegression = None
        np = None

def recommend_top(places, topk=5):
    from collections import Counter
    page_counter = Counter([p.page for p in places if p.page])
    element_counter = Counter([p.element for p in places if p.element])
    top_pages = page_counter.most_common(topk)
    top_elements = element_counter.most_common(topk)
    return {
        "top_pages": top_pages,
        "top_elements": top_elements
    }

def predict_clicks(places):
    if LogisticRegression is None or np is None:
        return {"error": "scikit-learn and numpy are required for prediction."}
    X = []
    y = []
    device_types = list(set(p.device_type for p in places if p.device_type))
    device_map = {d: i for i, d in enumerate(device_types)}
    for p in places:
        if p.device_type and p.page:
            X.append([device_map[p.device_type], len(p.page)])
            y.append(1)  # All are clicks
    if not X:
        return {"error": "Not enough data for prediction."}
    X = np.array(X)
    y = np.array(y)
    # Fake negative samples for demonstration
    X_fake = [[0, 0], [1, 1], [2, 2]]
    y_fake = [0, 0, 0]
    X = np.vstack([X, X_fake])
    y = np.concatenate([y, y_fake])
    model = LogisticRegression()
    model.fit(X, y)
    predictions = {}
    for d in device_types:
        for l in [5, 10, 20]:
            prob = model.predict_proba([[device_map[d], l]])[0][1]
            predictions[f"device:{d}_pagelen:{l}"] = prob
    return predictions

def build_output(args, places):
    output = {}
    output["recommendations"] = recommend_top(places, topk=args.topk if hasattr(args, "topk") else 5)
    output["predictions"] = predict_clicks(places)
    return output


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compute tourism recommendations from either the local CSV or a MySQL table.",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=DATA_PATH,
        help=f"Path to the CSV dataset (default: {DATA_PATH.name}).",
    )
    parser.add_argument(
        "--mode",
        choices=["daily", "top", "nearby"],
        default="daily",
        help="Type of recommendation to compute.",
    )
    parser.add_argument(
        "--category",
        help="Filter results to a single category (case insensitive).",
    )
    parser.add_argument(
        "--topk",
        type=int,
        default=5,
        help="Number of recommendations to return.",
    )
    parser.add_argument(
        "--min-reviews",
        type=int,
        default=0,
        help="Minimum user_ratings_total required for a place to be considered.",
    )
    parser.add_argument(
        "--latitude",
        type=float,
        help="Latitude of the user (required for nearby mode).",
    )
    parser.add_argument(
        "--longitude",
        type=float,
        help="Longitude of the user (required for nearby mode).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write the JSON payload to disk.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output.",
    )

    mysql = parser.add_argument_group("MySQL source")
    mysql.add_argument("--mysql-host", help="MySQL instance endpoint (enables MySQL mode).")
    mysql.add_argument("--mysql-port", type=int, default=None, help="MySQL port (default: 3306).")
    mysql.add_argument("--mysql-user", help="Database user for MySQL mode.")
    mysql.add_argument("--mysql-password", help="Password for the MySQL user (falls back to MYSQL_PASSWORD env).")
    mysql.add_argument("--mysql-db", help="Database/schema name to use.")
    mysql.add_argument(
        "--mysql-table",
        default=None,
        help="Table name containing POI data (default: places).",
    )
    mysql.add_argument(
        "--mysql-limit",
        type=int,
        help="Optional LIMIT clause for debugging large datasets.",
    )
    mysql.add_argument(
        "--mysql-ssl-ca",
        type=Path,
        help="Path to the CA certificate for SSL connections (optional).",
    )
    mysql.add_argument(
        "--mysql-ssl-cert",
        type=Path,
        help="Path to the client SSL certificate (optional).",
    )
    mysql.add_argument(
        "--mysql-ssl-key",
        type=Path,
        help="Path to the client SSL private key (optional).",
    )

    return parser.parse_args(argv)


def resolve_places(args: argparse.Namespace) -> List[Place]:
    host = coalesce(
        args.mysql_host,
        os.getenv("MYSQL_HOST"),
        os.getenv("DB_HOST"),
        os.getenv("RDS_ENDPOINT"),
    )
    if host:
        user = coalesce(
            args.mysql_user,
            os.getenv("MYSQL_USER"),
            os.getenv("DB_USER"),
            os.getenv("RDS_USERNAME"),
        )
        database = coalesce(
            args.mysql_db,
            os.getenv("MYSQL_DB"),
            os.getenv("MYSQL_DATABASE"),
            os.getenv("DB_NAME"),
        )
        missing: List[str] = []
        if not user:
            missing.append("--mysql-user or MYSQL_USER")
        if not database:
            missing.append("--mysql-db or MYSQL_DB")
        if missing:
            raise SystemExit("MySQL mode requires the following inputs: " + ", ".join(missing))
        password = coalesce(
            args.mysql_password,
            os.getenv("MYSQL_PASSWORD"),
            os.getenv("DB_PASSWORD"),
            "",
        )
        table_name = coalesce(
            args.mysql_table,
            os.getenv("MYSQL_TABLE"),
            os.getenv("DB_TABLE"),
            "places",
        )
        port_value = coalesce(
            args.mysql_port,
            os.getenv("MYSQL_PORT"),
            os.getenv("DB_PORT"),
            3306,
        )
        try:
            port = int(port_value)
        except (TypeError, ValueError):
            raise SystemExit("MySQL port must be an integer.")
        table_name = validate_identifier(str(table_name), label="mysql-table")
        ssl_ca = resolve_ssl_path(args.mysql_ssl_ca, "MYSQL_SSL_CA", label="mysql-ssl-ca")
        ssl_cert = resolve_ssl_path(args.mysql_ssl_cert, "MYSQL_SSL_CERT", label="mysql-ssl-cert")
        ssl_key = resolve_ssl_path(args.mysql_ssl_key, "MYSQL_SSL_KEY", label="mysql-ssl-key")
        return load_places_from_mysql(
            host=host,
            port=port,
            user=user,
            password=password or "",
            database=database,
            table=table_name,
            limit=args.mysql_limit,
            ssl_ca=ssl_ca,
            ssl_cert=ssl_cert,
            ssl_key=ssl_key,
        )
    return load_places_from_csv(args.csv)
def main(argv: Optional[Sequence[str]] = None) -> None:
    args = parse_args(argv)
    places = resolve_places(args)
    if not places:
        raise SystemExit("No valid places found in selected data source.")
    payload = build_output(args, places)
    if args.pretty:
        json_text = json.dumps(payload, indent=2, ensure_ascii=False)
    else:
        json_text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json_text + "\n", encoding="utf-8")
    else:
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except AttributeError:
            pass
        print(json_text)


if __name__ == "__main__":
    main()

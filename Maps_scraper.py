import requests
import json
import os
import time
import argparse
import subprocess

# --- CONFIGURATION ---
API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY")

if not API_KEY:
    raise ValueError("API key not found. Please set the 'GOOGLE_PLACES_API_KEY' environment variable.")

# Define the search queries for different categories
SEARCH_QUERIES = {
    "food_and_beverage": [
        "restaurants", "hawker centres", "cafes", "food courts",
        "bakeries", "bars", "pubs", "dessert shops", "coffee shops",
        "bistros", "eateries", "fast food restaurants", "ice cream shops",
        "vegetarian restaurants", "vegan restaurants", "sushi restaurants", "halal restaurants"
    ],
    "accommodation": [
        "hotels", "hostels", "airbnb", "resorts", "motels",
        "guest houses", "serviced apartments", "lodges"
    ],
    "activities": [
        "tourist attractions", "museums", "landmarks", "parks",
        "shopping malls", "theaters", "galleries", "cinemas",
        "nightclubs", "concert halls", "temples", "mosques",
        "churches", "beaches", "sports stadiums", "markets",
        "historical sites", "libraries"
    ]
}

# Define a grid of search locations to cover all of Singapore
GRID_LOCATIONS = {
    "central": {"lat": 1.290270, "lng": 103.851959},
    "north": {"lat": 1.43, "lng": 103.78},
    "south": {"lat": 1.26, "lng": 103.82},
    "east": {"lat": 1.35, "lng": 103.95},
    "west": {"lat": 1.34, "lng": 103.70},
}

# Define the output file and folder paths
DATA_DIR = "data"
IMAGES_DIR = os.path.join(DATA_DIR, "images")
JSONL_OUTPUT_FILE = os.path.join(DATA_DIR, "singapore_data.jsonl")
PROCESSED_QUERIES_FILE = os.path.join(DATA_DIR, 'processed_queries.txt')
PROCESSED_IDS_FILE = os.path.join(DATA_DIR, 'processed_ids.txt')

# --- HELPER FUNCTIONS ---
def load_processed_queries():
    """Loads a set of fully completed queries from the log file."""
    try:
        with open(PROCESSED_QUERIES_FILE, 'r') as f:
            return set(line.strip() for line in f)
    except FileNotFoundError:
        return set()

def save_processed_query(query):
    """Appends a new query to the log file to mark it as complete."""
    with open(PROCESSED_QUERIES_FILE, 'a') as f:
        f.write(f"{query}\n")

def load_processed_ids_from_jsonl():
    """Loads all place_ids from the main JSONL file for de-duplication."""
    processed_place_ids = set()
    if os.path.exists(JSONL_OUTPUT_FILE):
        print("Existing data file found. Loading Place IDs to prevent duplicates...")
        with open(JSONL_OUTPUT_FILE, 'r', encoding='utf-8') as infile:
            for i, line in enumerate(infile):
                try:
                    data = json.loads(line)
                    if data.get('place_id'):
                        processed_place_ids.add(data['place_id'])
                except json.JSONDecodeError as e:
                    print(f"Warning: Skipping malformed JSON line {i+1}: {e}")
                    continue
    return processed_place_ids

def save_processed_ids_to_txt(ids_set):
    """Saves the set of processed place_ids to a new text file for verification."""
    with open(PROCESSED_IDS_FILE, 'w') as f:
        for place_id in ids_set:
            f.write(f"{place_id}\n")
    print(f"Verification file created: {PROCESSED_IDS_FILE}")

def load_processed_ids_from_txt():
    """Loads place_ids from the verification text file for faster checking."""
    try:
        with open(PROCESSED_IDS_FILE, 'r') as f:
            return set(line.strip() for line in f)
    except FileNotFoundError:
        return set()

def perform_text_search(query, location, next_page_token=None):
    """
    Performs a text search with specific location bias and handles pagination.
    Includes a short sleep to allow the next page token to become valid.
    """
    params = {
        "query": query,
        "key": API_KEY,
        "language": "en",
        "location": f"{location['lat']},{location['lng']}",
        "radius": 15000
    }
    if next_page_token:
        params["pagetoken"] = next_page_token
        time.sleep(0.1)
    try:
        response = requests.get(TEXT_SEARCH_URL, params=params)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error during search for '{query}': {e}")
        return None

def get_place_details(place_id):
    """
    Fetches full details for a given place_id using the Place Details API.
    Fields are explicitly requested to control costs.
    """
    params = {
        "place_id": place_id,
        "key": API_KEY,
        "fields": "name,formatted_address,geometry,photos,reviews,rating,user_ratings_total,types,website,url,international_phone_number,vicinity,price_level,opening_hours"
    }
    try:
        response = requests.get(DETAILS_URL, params=params)
        response.raise_for_status()
        return response.json().get("result")
    except requests.exceptions.RequestException as e:
        print(f"Error fetching details for {place_id}: {e}")
        return None

def download_photo(photo_reference, place_id, photo_index):
    """Downloads a photo and returns its local path."""
    params = {
        "photo_reference": photo_reference,
        "maxwidth": 1600,
        "key": API_KEY
    }
    try:
        response = requests.get(PHOTO_URL, params=params, stream=True)
        response.raise_for_status()
        filename = f"{place_id}_{photo_index}.jpg"
        file_path = os.path.join(IMAGES_DIR, filename)
        with open(file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return file_path
    except requests.exceptions.RequestException as e:
        print(f"Error downloading photo for {place_id}: {e}")
        return None

def main(args):
    # Create directories if they don't exist
    os.makedirs(IMAGES_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)

    # Check if the user wants to test the conversion without scraping
    if args.jsonl_to_csv:
        print("--- Running conversion for JSONL to CSV. Skipping data collection. ---")
        if not os.path.exists(JSONL_OUTPUT_FILE):
            print(f"Error: The file '{JSONL_OUTPUT_FILE}' does not exist.")
            print("Please ensure you have a JSONL file to convert before running this test.")
            return

        print("\n--- Starting JSONL to CSV conversion using external script... ---")
        try:
            subprocess.run(["python", "jsonl_to_csv.py"], check=True)
            print("CSV conversion completed successfully.")
        except FileNotFoundError:
            print("Error: The script 'jsonl_to_csv.py' was not found. Please ensure it is in the correct directory.")
        except subprocess.CalledProcessError as e:
            print(f"Error: The external script 'jsonl_to_csv.py' failed with exit code {e.returncode}.")
        return

    # --- De-duplication and Verification Logic (Step 1) ---
    processed_place_ids = load_processed_ids_from_txt()
    if not processed_place_ids:
        processed_place_ids = load_processed_ids_from_jsonl()

    print(f"Found {len(processed_place_ids)} places from previous runs. Resuming...")

    if len(processed_place_ids) > 0:
        response = input("Verification completed. Do you want to proceed with data collection? (y/n): ").strip().lower()
        if response != 'y':
            print("Operation canceled by user. Exiting.")
            return
        else:
            save_processed_ids_to_txt(processed_place_ids)
    
    processed_queries = load_processed_queries()

    with open(JSONL_OUTPUT_FILE, 'a', encoding='utf-8') as outfile:
        print(f"\nStarting new data collection for Singapore...")
        places_processed_count = 0

        for location_name, location_coords in GRID_LOCATIONS.items():
            print(f"\n--- Searching for places in {location_name.upper()} Singapore ---")
            
            for category, queries in SEARCH_QUERIES.items():
                for query in queries:
                    full_query = f"{query} in {location_name}"
                    
                    if full_query in processed_queries:
                        print(f"--- Skipping '{full_query}' as it was already processed. ---")
                        continue

                    print(f"\nSearching for '{full_query}'...")
                    next_page_token = None
                    
                    while True:
                        search_results = perform_text_search(full_query, location_coords, next_page_token)
                        if not search_results or "results" not in search_results:
                            break

                        for place in search_results["results"]:
                            place_id = place.get("place_id")
                            
                            if not place_id or place_id in processed_place_ids:
                                print(f"  > Skipping place '{place.get('name')}' as it was already processed.")
                                continue

                            print(f"  > Fetching details for '{place.get('name')}'...")
                            details = get_place_details(place_id)
                            if not details:
                                continue
                            
                            details['place_id'] = place_id
                            processed_place_ids.add(place_id)
                            
                            local_image_paths = []
                            if "photos" in details:
                                for i, photo_data in enumerate(details["photos"]):
                                    photo_ref = photo_data.get("photo_reference")
                                    if photo_ref:
                                        path = download_photo(photo_ref, place_id, i)
                                        if path:
                                            local_image_paths.append(path)

                            details["local_image_paths"] = local_image_paths
                            
                            outfile.write(json.dumps(details, ensure_ascii=False) + '\n')
                            places_processed_count += 1
                            print(f"  > Progress: {places_processed_count} unique places collected.")
                            
                            time.sleep(0.01)

                        next_page_token = search_results.get("next_page_token")
                        if not next_page_token:
                            break

                    save_processed_query(full_query)
    
    print(f"\nData collection completed. Total unique places found: {len(processed_place_ids)}")
    print(f"Results are stored in {JSONL_OUTPUT_FILE} and images in the {IMAGES_DIR} folder.")
    
    print("\n--- Starting JSONL to CSV conversion using external script... ---")
    try:
        subprocess.run(["python", "jsonl_to_csv.py"], check=True)
        print("CSV conversion completed successfully.")
    except FileNotFoundError:
        print("Error: The script 'jsonl_to_csv.py' was not found. Please ensure it is in the correct directory.")
    except subprocess.CalledProcessError as e:
        print(f"Error: The external script 'jsonl_to_csv.py' failed with exit code {e.returncode}.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Google Places Data Collector and Converter.")
    parser.add_argument("--jsonl-to-csv", action="store_true",
                        help="Only tests the JSONL to CSV conversion, skipping data collection.")
    args = parser.parse_args()

    TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
    PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo"

    if not API_KEY:
        print("Error: Please set the 'GOOGLE_PLACES_API_KEY' environment variable.")
    else:
        main(args)
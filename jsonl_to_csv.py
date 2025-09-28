import json
import csv
from datetime import datetime

def get_unique_types(jsonl_file):
    """
    Reads a JSONL file and returns a sorted list of all unique 'types' found.
    """
    unique_types = set()
    try:
        with open(jsonl_file, 'r', encoding='utf-8') as infile:
            for line in infile:
                item = json.loads(line)
                if 'types' in item and isinstance(item['types'], list):
                    unique_types.update(item['types'])
    except FileNotFoundError:
        print(f"Error: The file '{jsonl_file}' was not found.")
        return []
    except json.JSONDecodeError:
        print(f"Error: There was an issue decoding the JSON in '{jsonl_file}'.")
        return []
    
    return sorted(list(unique_types))

def categorize_types(types_list):
    """
    Categorizes a list of types into a single, broader category
    based on a defined priority and an expanded keyword list.
    """
    if not isinstance(types_list, list):
        return 'Others'

    types_list_lower = [t.lower() for t in types_list]

    # Priority 1: Food and Beverage
    food_keywords = ['bakery', 'bar', 'cafe', 'food', 'liquor_store', 'meal_delivery', 'meal_takeaway', 'night_club', 'restaurant']
    if any(keyword in types_list_lower for keyword in food_keywords):
        return 'Food and Beverage'
    
    # Priority 2: Place of Worship
    worship_keywords = ['cemetery', 'church', 'hindu_temple', 'mosque', 'place_of_worship']
    if any(keyword in types_list_lower for keyword in worship_keywords):
        return 'Place of Worship'

    # Priority 3: Stays and Accommodations
    stays_keywords = ['lodging', 'hotel', 'motel', 'hostel', 'resort', 'accommodation', 'campground', 'rv_park']
    if any(keyword in types_list_lower for keyword in stays_keywords):
        return 'Stays & Accommodations'

    # Priority 4: Attractions, Activities
    attractions_keywords = ['amusement_park', 'aquarium', 'art_gallery', 'library', 'movie_theater', 'museum',
                            'natural_feature', 'park', 'tourist_attraction', 'zoo', 'landmark']
    if any(keyword in types_list_lower for keyword in attractions_keywords):
        return 'Attractions & Activities'
    
    # Priority 5: Shopping
    shopping_keywords = ['bicycle_store', 'book_store', 'clothing_store', 'convenience_store', 'department_store',
                         'electronics_store', 'florist', 'furniture_store', 'grocery_or_supermarket', 'home_goods_store',
                         'jewelry_store', 'shoe_store', 'shopping_mall', 'store', 'supermarket']
    if any(keyword in types_list_lower for keyword in shopping_keywords):
        return 'Shopping'
    
    # Priority 6: Sports & Wellness
    sports_wellness_keywords = ['beauty_salon', 'spa', 'gym', 'health', 'bowling_alley', 'stadium']
    if any(keyword in types_list_lower for keyword in sports_wellness_keywords):
        return 'Sports & Wellness'

    # Default category
    return 'Others'

def convert_jsonl_to_csv(jsonl_file, csv_file):
    """
    Converts a JSONL file to a CSV file, adds a 'Category' column, and filters for Singapore locations.
    """
    try:
        with open(jsonl_file, 'r', encoding='utf-8') as infile:
            data = [json.loads(line) for line in infile]
    except FileNotFoundError:
        print(f"Error: The file '{jsonl_file}' was not found.")
        return
    except json.JSONDecodeError:
        print(f"Error: There was an issue decoding the JSON in '{jsonl_file}'.")
        return

    # Filter out entries based on formatted_address and international_phone_number
    excluded_countries = [', Indonesia', ', Malaysia', ', Australia', ', India', ', Philippines', ', Vietnam', ', New Zealand', ', Thailand']
    
    filtered_data = []
    for item in data:
        # Check if address contains an excluded country
        address_is_ok = not any(item.get('formatted_address', '').endswith(country) for country in excluded_countries)
        
        # Check if phone number is a Singapore number or is empty/null
        phone_is_ok = item.get('international_phone_number') is None or \
                      item.get('international_phone_number') == '' or \
                      item.get('international_phone_number', '').startswith('+65')
        
        if address_is_ok and phone_is_ok:
            filtered_data.append(item)
    
    print(f"Original data entries: {len(data)}")
    print(f"Filtered data entries: {len(filtered_data)}")

    # Add the new 'Category' field to each item in the filtered data
    for item in filtered_data:
        item['category'] = categorize_types(item.get('types', []))

    # Determine all headers for the CSV file
    max_reviews = 0
    max_photos = 10
    
    for item in filtered_data:
        if 'reviews' in item and isinstance(item['reviews'], list):
            max_reviews = max(max_reviews, len(item['reviews']))

    # Manually build the ordered header list
    ordered_headers = [
        'formatted_address', 'international_phone_number', 'latitude', 'longitude', 'name', 
        'opening_hours', 'place_id', 'price_level', 'rating', 'types', 'category', 'url', 
        'user_ratings_total', 'vicinity', 'viewport_northeast_lat', 'viewport_northeast_lng', 
        'viewport_southwest_lat', 'viewport_southwest_lng', 'website'
    ]

    # Add review headers dynamically, including the exact date
    for i in range(max_reviews):
        ordered_headers.extend([
            f'review_{i+1}_author_name', f'review_{i+1}_rating', f'review_{i+1}_exact_date', 
            f'review_{i+1}_relative_time', f'review_{i+1}_text'
        ])
    
    # Add photo headers dynamically
    for i in range(max_photos):
        ordered_headers.append(f'photo_{i+1}_local_path')
    
    with open(csv_file, 'w', newline='', encoding='utf-8') as outfile:
        writer = csv.DictWriter(outfile, fieldnames=ordered_headers)
        writer.writeheader()
        
        for item in filtered_data:
            row = {}
            # Populate row with data from item based on the ordered_headers
            for key in ordered_headers:
                # Handle top-level keys
                if key in item:
                    row[key] = item[key]
                # Handle nested 'geometry' keys
                elif key == 'latitude' and 'geometry' in item and 'location' in item['geometry']:
                    row[key] = item['geometry']['location'].get('lat')
                elif key == 'longitude' and 'geometry' in item and 'location' in item['geometry']:
                    row[key] = item['geometry']['location'].get('lng')
                elif key == 'viewport_northeast_lat' and 'geometry' in item and 'viewport' in item['geometry']:
                    row[key] = item['geometry']['viewport'].get('northeast', {}).get('lat')
                elif key == 'viewport_northeast_lng' and 'geometry' in item and 'viewport' in item['geometry']:
                    row[key] = item['geometry']['viewport'].get('northeast', {}).get('lng')
                elif key == 'viewport_southwest_lat' and 'geometry' in item and 'viewport' in item['geometry']:
                    row[key] = item['geometry']['viewport'].get('southwest', {}).get('lat')
                elif key == 'viewport_southwest_lng' and 'geometry' in item and 'viewport' in item['geometry']:
                    row[key] = item['geometry']['viewport'].get('southwest', {}).get('lng')
                # Handle nested 'reviews' keys
                elif key.startswith('review_') and 'reviews' in item and isinstance(item['reviews'], list):
                    review_index = int(key.split('_')[1]) - 1
                    if review_index < len(item['reviews']):
                        review = item['reviews'][review_index]
                        sub_key = key.split('_', 2)[-1]
                        if sub_key == 'exact_date' and 'time' in review:
                            row[key] = datetime.fromtimestamp(review['time']).strftime('%Y-%m-%d %H:%M:%S')
                        elif sub_key == 'relative_time':
                            row[key] = review.get('relative_time_description')
                        else:
                            row[key] = review.get(sub_key)
                # Handle nested 'local_image_paths' keys
                elif key.startswith('photo_') and 'local_image_paths' in item and isinstance(item['local_image_paths'], list):
                    photo_index = int(key.split('_')[1]) - 1
                    if photo_index < len(item['local_image_paths']):
                        row[key] = item['local_image_paths'][photo_index]
            
            writer.writerow(row)

    print(f"Conversion complete! Data with all original columns has been saved to '{csv_file}'.")

if __name__ == "__main__":
    jsonl_file_path = 'static/data/singapore_data.jsonl'
    output_csv_path = 'singapore_data_with_category.csv'

    # Step 1: Find and list all unique types
    print("Finding all unique categories in the raw data...")
    all_unique_types = get_unique_types(jsonl_file_path)
    print(f"Total unique categories found: {len(all_unique_types)}")
    print("---")
    print("List of Unique Categories:")
    for i, t in enumerate(all_unique_types):
        print(f"  {i+1}. {t}")
    print("---")

    # Step 2: Convert and categorize
    print("Starting CSV conversion and categorization...")
    convert_jsonl_to_csv(jsonl_file_path, output_csv_path)
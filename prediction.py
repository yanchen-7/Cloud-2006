import os
from fastapi import FastAPI, HTTPException
import pandas as pd
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import pymysql
from typing import List

# --- Database Configuration ---
# Replace with your actual credentials. Use environment variables for security.
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_NAME = os.getenv("DB_NAME", "tourism_app")
DB_TABLE = "user_interactions" # Assuming a table with user_id, place_id

# --- Mock Data for Fallback ---
# Used if the database connection fails or there's not enough data.
DUMMY_INTERACTIONS = {
    'user_id': [1, 1, 2, 2, 3, 3, 3, 4, 4, 5],
    'place_id': [101, 102, 101, 103, 102, 103, 104, 104, 105, 101],
    'interaction_type': ['click', 'save', 'click', 'review', 'click', 'save', 'review', 'click', 'save', 'review']
}
# Mock top-rated places for cold-start users
MOCK_TOP_RATED_PLACES = [101, 103, 105, 201, 202]

# --- Helper Functions & Data Pipeline ---

def get_user_item_matrix() -> pd.DataFrame:
    """
    Fetches user interaction data and builds a user-item matrix.

    Rows = users, Columns = places, Values = 1 if interacted, else 0.
    Falls back to dummy data if the database connection fails.

    Returns:
        pd.DataFrame: The user-item matrix.
    """
    try:
        # Connect to the database
        conn = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            cursorclass=pymysql.cursors.DictCursor
        )
        # Query to get all user-place interactions
        query = f"SELECT DISTINCT user_id, place_id FROM {DB_TABLE}"
        df = pd.read_sql(query, conn)
        conn.close()
        
        if df.empty:
            raise ValueError("No interaction data found in the database.")

    except (pymysql.MySQLError, ValueError) as e:
        print(f"Database connection failed or no data: {e}. Falling back to dummy data.")
        df = pd.DataFrame(DUMMY_INTERACTIONS)

    # Create the user-item matrix
    # 1 if interacted, 0 otherwise
    user_item_matrix = pd.crosstab(df['user_id'], df['place_id'])
    # Ensure all values are binary
    user_item_matrix[user_item_matrix > 0] = 1
    
    return user_item_matrix

# --- Machine Learning & Recommendation Logic ---

def recommend_for_user(user_id: int, top_n: int = 5) -> List[int]:
    """
    Generates personalized recommendations for a given user.

    Args:
        user_id (int): The ID of the user to generate recommendations for.
        top_n (int): The number of recommendations to return.

    Returns:
        List[int]: A list of recommended place IDs.
    """
    user_item_matrix = get_user_item_matrix()

    # --- Cold Start Strategy ---
    # If the user is new or has no interactions, fall back to top-rated places.
    if user_id not in user_item_matrix.index:
        print(f"Cold start for user_id: {user_id}. Returning mock top-rated places.")
        return MOCK_TOP_RATED_PLACES[:top_n]

    # --- Collaborative Filtering Strategy ---
    
    # 1. Compute User-to-User Similarity
    # We transpose the matrix to calculate similarity between users
    user_similarity = cosine_similarity(user_item_matrix)
    user_similarity_df = pd.DataFrame(user_similarity, index=user_item_matrix.index, columns=user_item_matrix.index)

    # 2. Find Similar Users
    # Get similarity scores for the target user, but exclude the user themselves
    similar_users = user_similarity_df[user_id].sort_values(ascending=False).drop(user_id)
    
    if similar_users.empty:
        print(f"No similar users found for user_id: {user_id}. Returning mock top-rated places.")
        return MOCK_TOP_RATED_PLACES[:top_n]

    # 3. Generate Recommendations
    
    # Get places the target user has already interacted with
    user_interacted_items = user_item_matrix.loc[user_id]
    user_interacted_items = user_interacted_items[user_interacted_items > 0].index.tolist()

    recommendations = {}
    # Loop through similar users and their items
    for other_user_id, similarity_score in similar_users.items():
        if similarity_score <= 0:
            continue
        
        # Get items interacted with by the similar user
        other_user_items = user_item_matrix.loc[other_user_id]
        other_user_items = other_user_items[other_user_items > 0].index

        for place_id in other_user_items:
            # Add to recommendations if the target user hasn't seen it yet
            if place_id not in user_interacted_items:
                # Weight the item by the similarity score
                if place_id not in recommendations:
                    recommendations[place_id] = 0
                recommendations[place_id] += similarity_score

    # 4. Sort and Return Top-N Recommendations
    sorted_recommendations = sorted(recommendations.items(), key=lambda item: item[1], reverse=True)
    
    # Extract just the place IDs
    recommended_place_ids = [place_id for place_id, score in sorted_recommendations]

    return recommended_place_ids[:top_n]


# --- FastAPI Microservice ---

app = FastAPI(
    title="Tourism Recommendation API",
    description="Provides personalized place recommendations based on user interactions.",
    version="1.0.0"
)

@app.get("/recommendations", response_model=List[int])
async def get_recommendations(user_id: int, top_n: int = 5):
    """
    Generates and returns a list of recommended place IDs for a given user.

    - **user_id**: The unique identifier for the user.
    - **top_n**: The number of recommendations to return (default: 5).
    """
    if user_id <= 0:
        raise HTTPException(status_code=400, detail="user_id must be a positive integer.")
    if top_n <= 0:
        raise HTTPException(status_code=400, detail="top_n must be a positive integer.")

    try:
        recommendations = recommend_for_user(user_id=user_id, top_n=top_n)
        if not recommendations:
            # This can happen if the user has seen all items from similar users
            print(f"No new recommendations for user {user_id}. Returning mock top-rated places.")
            return MOCK_TOP_RATED_PLACES[:top_n]
        return recommendations
    except Exception as e:
        print(f"An error occurred: {e}")
        raise HTTPException(status_code=500, detail="Internal server error in recommendation engine.")

# To run this microservice, use the command:
# uvicorn prediction:app --reload
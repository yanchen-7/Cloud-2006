"""
Utility to clean the raw review_for_ML.csv before model training.
- Keeps only review_text and sentiment_label for training.
- Normalizes casing/whitespace and removes obvious bad rows.
- Drops duplicates on (review_text, sentiment_label).
"""

import argparse
import pandas as pd


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Keep only needed columns and drop rows without text/label
    df = df[["review_text", "sentiment_label"]]
    df = df[df["review_text"].notna() & df["sentiment_label"].notna()]

    # Normalize casing/whitespace
    df["review_text"] = df["review_text"].str.strip().str.lower()
    df["sentiment_label"] = df["sentiment_label"].str.strip().str.lower()

    # Keep only valid labels
    df = df[df["sentiment_label"].isin(["positive", "neutral", "negative"])]

    # Drop duplicates and overly short/long texts
    df = df.drop_duplicates(subset=["review_text", "sentiment_label"])
    df = df[(df["review_text"].str.len() >= 5) & (df["review_text"].str.len() <= 2000)]

    return df


def main():
    parser = argparse.ArgumentParser(description="Clean review_for_ML.csv for model training.")
    parser.add_argument(
        "--input",
        default="review_for_ML.csv",
        help="Path to the raw CSV (default: review_for_ML.csv)",
    )
    parser.add_argument(
        "--output",
        default="review_for_ML_clean.csv",
        help="Where to write the cleaned CSV (default: review_for_ML_clean.csv)",
    )
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    cleaned = clean_dataframe(df)
    cleaned.to_csv(args.output, index=False)
    print(f"Cleaned {len(cleaned)} rows -> {args.output}")


if __name__ == "__main__":
    main()

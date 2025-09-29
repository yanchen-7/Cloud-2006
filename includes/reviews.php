<?php
declare(strict_types=1);

function fetch_reviews_for_place(string $placeId): array
{
    $sql = 'SELECT r.review_id, r.account_id, r.place_id, r.rating, r.comment, r.created_at, r.updated_at, a.username FROM user_reviews r INNER JOIN accounts a ON a.account_id = r.account_id WHERE r.place_id = :place_id ORDER BY r.created_at DESC';
    $stmt = get_db()->prepare($sql);
    $stmt->execute(['place_id' => $placeId]);
    $rows = $stmt->fetchAll();

    return array_map(function (array $row): array {
        return [
            'review_id' => (int)$row['review_id'],
            'account_id' => (int)$row['account_id'],
            'place_id' => (string)$row['place_id'],
            'rating' => isset($row['rating']) ? (float)$row['rating'] : null,
            'comment' => $row['comment'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'author' => $row['username'] ?? null,
        ];
    }, $rows);
}

function fetch_reviews_for_account(int $accountId): array
{
    $sql = 'SELECT review_id, account_id, place_id, rating, comment, created_at, updated_at FROM user_reviews WHERE account_id = :account_id ORDER BY updated_at DESC';
    $stmt = get_db()->prepare($sql);
    $stmt->execute(['account_id' => $accountId]);
    $rows = $stmt->fetchAll();

    return array_map(function (array $row): array {
        return [
            'review_id' => (int)$row['review_id'],
            'account_id' => (int)$row['account_id'],
            'place_id' => (string)$row['place_id'],
            'rating' => isset($row['rating']) ? (float)$row['rating'] : null,
            'comment' => $row['comment'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }, $rows);
}

function fetch_review_for_account_place(int $accountId, string $placeId): ?array
{
    $sql = 'SELECT review_id, account_id, place_id, rating, comment, created_at, updated_at FROM user_reviews WHERE account_id = :account_id AND place_id = :place_id LIMIT 1';
    $stmt = get_db()->prepare($sql);
    $stmt->execute([
        'account_id' => $accountId,
        'place_id' => $placeId,
    ]);
    $row = $stmt->fetch();
    if ($row === false) {
        return null;
    }

    return [
        'review_id' => (int)$row['review_id'],
        'account_id' => (int)$row['account_id'],
        'place_id' => (string)$row['place_id'],
        'rating' => isset($row['rating']) ? (float)$row['rating'] : null,
        'comment' => $row['comment'] ?? null,
        'created_at' => $row['created_at'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
    ];
}

function fetch_review_by_id(int $reviewId): ?array
{
    $sql = 'SELECT r.review_id, r.account_id, r.place_id, r.rating, r.comment, r.created_at, r.updated_at, a.username FROM user_reviews r INNER JOIN accounts a ON a.account_id = r.account_id WHERE r.review_id = :review_id LIMIT 1';
    $stmt = get_db()->prepare($sql);
    $stmt->execute(['review_id' => $reviewId]);
    $row = $stmt->fetch();
    if ($row === false) {
        return null;
    }

    return [
        'review_id' => (int)$row['review_id'],
        'account_id' => (int)$row['account_id'],
        'place_id' => (string)$row['place_id'],
        'rating' => isset($row['rating']) ? (float)$row['rating'] : null,
        'comment' => $row['comment'] ?? null,
        'created_at' => $row['created_at'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
        'author' => $row['username'] ?? null,
    ];
}

function upsert_review(int $accountId, string $placeId, ?float $rating, ?string $comment): array
{
    ensure_business($placeId);

    $pdo = get_db();
    $existing = fetch_review_for_account_place($accountId, $placeId);
    $comment = $comment !== null ? trim($comment) : null;

    if ($existing) {
        $sql = 'UPDATE user_reviews SET rating = :rating, comment = :comment, updated_at = NOW() WHERE review_id = :review_id';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'rating' => $rating,
            'comment' => $comment,
            'review_id' => $existing['review_id'],
        ]);
        $reviewId = $existing['review_id'];
    } else {
        $sql = 'INSERT INTO user_reviews (account_id, place_id, rating, comment, created_at, updated_at) VALUES (:account_id, :place_id, :rating, :comment, NOW(), NOW())';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            'account_id' => $accountId,
            'place_id' => $placeId,
            'rating' => $rating,
            'comment' => $comment,
        ]);
        $reviewId = (int)$pdo->lastInsertId();
    }

    $review = fetch_review_by_id($reviewId);
    if (!$review) {
        throw new RuntimeException('Unable to persist review.');
    }

    return $review;
}

function delete_review(int $accountId, int $reviewId): void
{
    $sql = 'DELETE FROM user_reviews WHERE review_id = :review_id AND account_id = :account_id';
    $stmt = get_db()->prepare($sql);
    $stmt->execute([
        'review_id' => $reviewId,
        'account_id' => $accountId,
    ]);
}

function calculate_review_summary(string $placeId): array
{
    $sql = 'SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating FROM user_reviews WHERE place_id = :place_id AND rating IS NOT NULL';
    $stmt = get_db()->prepare($sql);
    $stmt->execute(['place_id' => $placeId]);
    $row = $stmt->fetch();

    return [
        'count' => isset($row['total_reviews']) ? (int)$row['total_reviews'] : 0,
        'average' => isset($row['average_rating']) ? (float)$row['average_rating'] : null,
    ];
}
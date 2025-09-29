<?php
declare(strict_types=1);

function transform_business_row(array $row): array
{
    return [
        'place_id' => (string)$row['place_id'],
        'name' => $row['name'] ?? $row['place_name'] ?? '',
        'place_name' => $row['place_name'] ?? null,
        'formatted_address' => $row['formatted_address'] ?? $row['address'] ?? null,
        'address' => $row['address'] ?? $row['formatted_address'] ?? null,
        'latitude' => isset($row['latitude']) ? (float)$row['latitude'] : null,
        'longitude' => isset($row['longitude']) ? (float)$row['longitude'] : null,
        'category' => $row['category'] ?? null,
        'international_phone_number' => $row['international_phone_number'] ?? null,
        'website' => $row['website'] ?? null,
        'opening_hours' => $row['opening_hours'] ?? null,
        'rating' => isset($row['rating']) ? (float)$row['rating'] : null,
        'price_level' => isset($row['price_level']) ? (int)$row['price_level'] : null,
    ];
}

function fetch_all_businesses(): array
{
    try {
        // Try mysqli first (for cloud connection)
        return fetch_all_businesses_mysqli();
    } catch (Exception $e) {
        // Fallback to PDO
        $sql = 'SELECT place_id, name, place_name, formatted_address, address, latitude, longitude, category, international_phone_number, website, opening_hours, rating, price_level FROM business_info';
        $stmt = get_db()->query($sql);
        $rows = $stmt->fetchAll();
        return array_map('transform_business_row', $rows);
    }
}

function fetch_all_businesses_mysqli(): array
{
    $conn = get_mysqli();
    $sql = 'SELECT place_id, name, place_name, formatted_address, address, latitude, longitude, category, international_phone_number, website, opening_hours, rating, price_level FROM business_info';
    $result = $conn->query($sql);
    
    if (!$result) {
        throw new RuntimeException('Query failed: ' . $conn->error);
    }
    
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = transform_business_row($row);
    }
    
    return $rows;
}

function fetch_business_by_place(string $placeId): ?array
{
    try {
        // Try mysqli first (for cloud connection)
        return fetch_business_by_place_mysqli($placeId);
    } catch (Exception $e) {
        // Fallback to PDO
        $sql = 'SELECT place_id, name, place_name, formatted_address, address, latitude, longitude, category, international_phone_number, website, opening_hours, rating, price_level FROM business_info WHERE place_id = :place_id LIMIT 1';
        $stmt = get_db()->prepare($sql);
        $stmt->execute(['place_id' => $placeId]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        return transform_business_row($row);
    }
}

function fetch_business_by_place_mysqli(string $placeId): ?array
{
    $conn = get_mysqli();
    $sql = 'SELECT place_id, name, place_name, formatted_address, address, latitude, longitude, category, international_phone_number, website, opening_hours, rating, price_level FROM business_info WHERE place_id = ? LIMIT 1';
    $stmt = $conn->prepare($sql);
    
    if (!$stmt) {
        throw new RuntimeException('Prepare failed: ' . $conn->error);
    }
    
    $stmt->bind_param('s', $placeId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    
    if ($row === null) {
        return null;
    }
    
    return transform_business_row($row);
}

function ensure_business(string $placeId): array
{
    $business = fetch_business_by_place($placeId);
    if (!$business) {
        throw new RuntimeException('Place not found.');
    }
    return $business;
}

function fetch_user_favourites(int $accountId): array
{
    $sql = 'SELECT uf.place_id, uf.added_at, b.name, b.place_name, b.formatted_address, b.address, b.latitude, b.longitude, b.category, b.international_phone_number, b.website, b.opening_hours, b.rating, b.price_level FROM user_favourites uf INNER JOIN business_info b ON b.place_id = uf.place_id WHERE uf.account_id = :account_id ORDER BY uf.added_at DESC';
    $stmt = get_db()->prepare($sql);
    $stmt->execute(['account_id' => $accountId]);
    $rows = $stmt->fetchAll();

    return array_map(function (array $row): array {
        $business = transform_business_row($row);
        $business['added_at'] = $row['added_at'] ?? null;
        return $business;
    }, $rows);
}

function add_favourite_place(int $accountId, string $placeId): array
{
    $pdo = get_db();
    $business = ensure_business($placeId);

    $sql = 'INSERT INTO user_favourites (account_id, place_id, added_at) VALUES (:account_id, :place_id, NOW())';
    $stmt = $pdo->prepare($sql);
    try {
        $stmt->execute([
            'account_id' => $accountId,
            'place_id' => $placeId,
        ]);
    } catch (PDOException $exception) {
        if ($exception->getCode() !== '23000') {
            throw $exception;
        }
    }

    $select = $pdo->prepare('SELECT added_at FROM user_favourites WHERE account_id = :account_id AND place_id = :place_id ORDER BY added_at DESC LIMIT 1');
    $select->execute([
        'account_id' => $accountId,
        'place_id' => $placeId,
    ]);
    $addedAt = $select->fetchColumn() ?: null;

    $business['added_at'] = $addedAt;
    return $business;
}

function remove_favourite_place(int $accountId, string $placeId): void
{
    $sql = 'DELETE FROM user_favourites WHERE account_id = :account_id AND place_id = :place_id';
    $stmt = get_db()->prepare($sql);
    $stmt->execute([
        'account_id' => $accountId,
        'place_id' => $placeId,
    ]);
}

function favourites_contains(int $accountId, string $placeId): bool
{
    $sql = 'SELECT 1 FROM user_favourites WHERE account_id = :account_id AND place_id = :place_id LIMIT 1';
    $stmt = get_db()->prepare($sql);
    $stmt->execute([
        'account_id' => $accountId,
        'place_id' => $placeId,
    ]);

    return (bool)$stmt->fetchColumn();
}
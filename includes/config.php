<?php
declare(strict_types=1);

const DB_CONFIG_PATH = '/var/www/private/db-config.ini';

function load_db_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    if (!is_file(DB_CONFIG_PATH)) {
        throw new RuntimeException('Database config not found at ' . DB_CONFIG_PATH);
    }

    $raw = parse_ini_file(DB_CONFIG_PATH, false, INI_SCANNER_TYPED);
    if ($raw === false) {
        throw new RuntimeException('Unable to parse database configuration file.');
    }

    $servername = $raw['servername'] ?? null;
    $database = $raw['dbname'] ?? null;
    $username = $raw['username'] ?? null;
    $password = $raw['password'] ?? '';
    $port = isset($raw['port']) ? (int)$raw['port'] : 3306;

    foreach (['servername' => $servername, 'dbname' => $database, 'username' => $username] as $key => $value) {
        if ($value === null || $value === '') {
            throw new RuntimeException("Database config missing required '{$key}' value.");
        }
    }

    $config = [
        'host' => (string)$servername,
        'database' => (string)$database,
        'username' => (string)$username,
        'password' => (string)$password,
        'port' => $port,
        'servername' => (string)$servername,
        'dbname' => (string)$database,
    ];

    return $config;
}

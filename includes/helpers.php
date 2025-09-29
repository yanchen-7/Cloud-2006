<?php
declare(strict_types=1);

function redirect(string $path): void
{
    header('Location: ' . $path);
    exit;
}

function html_escape(mixed $value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function request_path(): string
{
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH);
    if (!is_string($path) || $path === '') {
        return '/';
    }
    return $path;
}

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function is_post(): bool
{
    return request_method() === 'POST';
}

function starts_with(string $haystack, string $needle): bool
{
    if ($needle === '') {
        return true;
    }
    return strncmp($haystack, $needle, strlen($needle)) === 0;
}

function sanitize_redirect_target(?string $target): string
{
    if (!is_string($target) || $target === '') {
        return '/';
    }

    if (!starts_with($target, '/')) {
        return '/';
    }

    if (starts_with($target, '//')) {
        return '/';
    }

    return $target;
}

function json_response(mixed $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        http_response_code(500);
        echo '{"error":"Failed to encode response"}';
    } else {
        echo $json;
    }
    exit;
}

function json_error(string $message, int $status = 400, array $context = []): void
{
    $payload = ['error' => $message];
    if ($context) {
        $payload['context'] = $context;
    }
    json_response($payload, $status);
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false) {
        json_error('Unable to read request body', 400);
    }

    $raw = trim($raw);
    if ($raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
        json_error('Invalid JSON payload', 400, ['detail' => json_last_error_msg()]);
    }

    if (!is_array($data)) {
        json_error('JSON payload must decode to an object', 400);
    }

    return $data;
}

function require_api_auth(): array
{
    $user = auth_get_current_user();
    if (!$user) {
        json_error('Authentication required', 401);
    }
    return $user;
}

function respond_no_content(int $status = 204): void
{
    http_response_code($status);
    exit;
}
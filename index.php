<?php
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

try {
    dispatch_request();
} catch (Throwable $exception) {
    http_response_code(500);
    $message = $exception->getMessage();
    render_template('error', ['errorMessage' => $message]);
}

function dispatch_request(): void
{
    $path = request_path();
    if ($path !== '/' && substr($path, -1) === '/') {
        $path = rtrim($path, '/');
    }

    if (starts_with($path, '/api/')) {
        handle_api_request($path);
        return;
    }
    switch ($path) {
        case '/':
        case '/index.php':
            handle_home();
            return;
        case '/explore':
            handle_explore();
            return;
        case '/login':
            handle_login();
            return;
        case '/register':
            handle_register();
            return;
        case '/profile':
            handle_profile();
            return;
        case '/logout':
            handle_logout();
            return;
        case '/forgot':
            handle_forgot();
            return;
        case '/favicon.ico':
            handle_favicon();
            return;
        default:
            http_response_code(404);
            render_template('404');
            return;
    }
}

function handle_api_request(string $path): void
{
    $segments = explode('/', trim($path, '/'));
    $resource = $segments[1] ?? '';
    $method = request_method();

    switch ($resource) {
        case 'session':
            handle_api_session($method);
            return;
        case 'places':
            handle_api_places($method, $segments);
            return;
        case 'favourites':
            handle_api_favourites($method, $segments);
            return;
        case 'reviews':
            handle_api_reviews($method, $segments);
            return;
        default:
            json_error('Not found', 404);
    }
}

function api_method_not_allowed(array $allowed): void
{
    header('Allow: ' . implode(', ', $allowed));
    json_error('Method not allowed', 405);
}

function handle_api_session(string $method): void
{
    if ($method !== 'GET') {
        api_method_not_allowed(['GET']);
    }

    $user = auth_get_current_user();
    json_response([
        'authenticated' => $user !== null,
        'user' => $user ? [
            'account_id' => (int)$user['account_id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'role' => $user['role'] ?? 'user',
        ] : null,
    ]);
}

function handle_api_places(string $method, array $segments): void
{
    if ($method !== 'GET') {
        api_method_not_allowed(['GET']);
    }

    $placeId = $segments[2] ?? null;
    if ($placeId !== null && $placeId !== '') {
        $placeId = rawurldecode($placeId);
        $place = fetch_business_by_place($placeId);
        if (!$place) {
            json_error('Place not found', 404);
        }
        $summary = calculate_review_summary($placeId);
        $place['user_reviews'] = fetch_reviews_for_place($placeId);
        $place['user_reviews_summary'] = $summary;
        json_response($place);
    }

    $places = fetch_all_businesses();
    json_response($places);
}

function handle_api_favourites(string $method, array $segments): void
{
    $user = require_api_auth();
    $accountId = (int)$user['account_id'];

    switch ($method) {
        case 'GET':
            $favourites = fetch_user_favourites($accountId);
            json_response($favourites);
            return;
        case 'POST':
            $payload = read_json_body();
            $placeId = isset($payload['place_id']) ? trim((string)$payload['place_id']) : '';
            if ($placeId === '') {
                json_error('place_id is required', 422);
            }
            $placeId = rawurldecode($placeId);
            $favourite = add_favourite_place($accountId, $placeId);
            json_response($favourite, 201);
            return;
        case 'DELETE':
            $placeId = $segments[2] ?? '';
            $placeId = trim(rawurldecode($placeId));
            if ($placeId === '') {
                json_error('place_id is required', 400);
            }
            remove_favourite_place($accountId, $placeId);
            respond_no_content();
            return;
        default:
            api_method_not_allowed(['GET', 'POST', 'DELETE']);
    }
}

function handle_api_reviews(string $method, array $segments): void
{
    switch ($method) {
        case 'GET':
            $placeId = isset($_GET['place_id']) ? trim((string)$_GET['place_id']) : '';
            if ($placeId !== '') {
                $placeId = rawurldecode($placeId);
                ensure_business($placeId);
                $reviews = fetch_reviews_for_place($placeId);
                $summary = calculate_review_summary($placeId);
                json_response([
                    'place_id' => $placeId,
                    'reviews' => $reviews,
                    'summary' => $summary,
                ]);
            }
            $user = require_api_auth();
            $reviews = fetch_reviews_for_account((int)$user['account_id']);
            json_response($reviews);
            return;
        case 'POST':
            $user = require_api_auth();
            $payload = read_json_body();
            $placeId = isset($payload['place_id']) ? trim((string)$payload['place_id']) : '';
            if ($placeId === '') {
                json_error('place_id is required', 422);
            }
            $placeId = rawurldecode($placeId);

            $rating = $payload['rating'] ?? null;
            if ($rating !== null && $rating !== '') {
                $rating = (float)$rating;
                if ($rating < 0 || $rating > 5) {
                    json_error('Rating must be between 0 and 5.', 422);
                }
            } else {
                $rating = null;
            }

            $comment = isset($payload['comment']) ? trim((string)$payload['comment']) : null;
            if ($comment === '') {
                $comment = null;
            }

            $review = upsert_review((int)$user['account_id'], $placeId, $rating, $comment);
            $summary = calculate_review_summary($placeId);
            $review['summary'] = $summary;
            json_response($review, 201);
            return;
        case 'DELETE':
            $user = require_api_auth();
            $reviewId = $segments[2] ?? '';
            if ($reviewId === '') {
                json_error('Review identifier is required.', 400);
            }
            $reviewId = (int)$reviewId;
            delete_review((int)$user['account_id'], $reviewId);
            respond_no_content();
            return;
        default:
            api_method_not_allowed(['GET', 'POST', 'DELETE']);
}
}

function handle_home(): void
{
    render_template('home', ['pageId' => 'home']);
}

function handle_explore(): void
{
    render_template('explore', ['pageId' => 'explore']);
}

function handle_login(): void
{
    if (is_logged_in()) {
        redirect('/');
    }

    if (is_post()) {
        $username = trim($_POST['username'] ?? '');
        $password = $_POST['password'] ?? '';

        if ($username === '' || $password === '') {
            add_flash('All fields are required.', 'error');
            render_template('login');
            return;
        }

        $user = authenticate_user($username, $password);
        if (!$user) {
            add_flash('Invalid username or password.', 'error');
            render_template('login');
            return;
        }

        login_user($user);
        add_flash('Logged in successfully.', 'success');
        $next = sanitize_redirect_target($_GET['next'] ?? '/');
        redirect($next);
    }

    render_template('login');
}

function handle_register(): void
{
    if (is_logged_in()) {
        redirect('/');
    }

    if (is_post()) {
        $username = trim($_POST['username'] ?? '');
        $email = strtolower(trim($_POST['email'] ?? ''));
        $password = $_POST['password'] ?? '';
        $confirm = $_POST['confirm_password'] ?? '';

        if ($username === '' || $email === '' || $password === '') {
            add_flash('All required fields must be provided.', 'error');
            render_template('register');
            return;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            add_flash('Please enter a valid email address.', 'error');
            render_template('register');
            return;
        }

        if ($password !== $confirm) {
            add_flash('Passwords do not match.', 'error');
            render_template('register');
            return;
        }

        if (find_account_by_username($username)) {
            add_flash('Username already exists.', 'error');
            render_template('register');
            return;
        }

        if (find_account_by_email($email)) {
            add_flash('Email already exists.', 'error');
            render_template('register');
            return;
        }

        $gender = $_POST['gender'] ?? null;
        $dateOfBirth = normalize_date($_POST['date_of_birth'] ?? null);
        $mobile = trim($_POST['mobile_number'] ?? '') ?: null;
        $country = trim($_POST['country_of_origin'] ?? '') ?: null;

        try {
            $userId = create_user([
                'username' => $username,
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'gender' => $gender ?: null,
                'date_of_birth' => $dateOfBirth,
                'mobile_number' => $mobile,
                'country_of_origin' => $country,
            ]);
        } catch (PDOException $exception) {
            add_flash('Unable to register at this time.', 'error');
            render_template('register');
            return;
        }

        if ($userId > 0) {
            add_flash('Registration successful. Please login.', 'success');
            redirect('/login');
        }

        add_flash('Unable to register at this time.', 'error');
        render_template('register');
        return;
    }
    render_template('register');
}

function handle_profile(): void
{
    $user = require_login();

    if (is_post()) {
        $email = strtolower(trim($_POST['email'] ?? ''));
        $gender = $_POST['gender'] ?? null;
        $dateOfBirth = normalize_date($_POST['date_of_birth'] ?? null);
        $mobile = trim($_POST['mobile_number'] ?? '') ?: null;
        $country = trim($_POST['country_of_origin'] ?? '') ?: null;
        $newPassword = $_POST['password'] ?? '';
        $confirm = $_POST['confirm_password'] ?? '';

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            add_flash('Please provide a valid email address.', 'error');
            render_template('profile', ['user' => auth_get_current_user()]);
            return;
        }

        $payload = [
            'email' => $email,
            'gender' => $gender ?: null,
            'date_of_birth' => $dateOfBirth,
            'mobile_number' => $mobile,
            'country_of_origin' => $country,
        ];

        if ($newPassword !== '') {
            if ($newPassword !== $confirm) {
                add_flash('Passwords do not match.', 'error');
                render_template('profile', ['user' => auth_get_current_user()]);
                return;
            }
            $payload['password_hash'] = password_hash($newPassword, PASSWORD_DEFAULT);
        }

        try {
            update_user_profile($user['account_id'], $payload);
        } catch (PDOException $exception) {
            add_flash('Unable to update profile at this time.', 'error');
            render_template('profile', ['user' => auth_get_current_user()]);
            return;
        }

        add_flash('Profile updated.', 'success');
        set_current_user(find_account_by_id($user['account_id']));
        render_template('profile', ['user' => auth_get_current_user()]);
        return;
    }

    render_template('profile', ['user' => $user]);
}


function handle_logout(): void
{
    if (is_logged_in()) {
        logout_current_user();
        add_flash('You have been logged out.', 'info');
    }

    redirect('/');
}

function handle_forgot(): void
{
    if (is_post()) {
        $email = strtolower(trim($_POST['email'] ?? ''));
        if ($email === '') {
            add_flash('Please enter your email.', 'error');
        } else {
            add_flash('If that email exists, a reset link has been sent.', 'info');
            redirect('/login');
        }
    }

    render_template('forgot');
}


function handle_favicon(): void
{
    $iconPath = __DIR__ . '/static/favicon.ico';
    if (!is_file($iconPath)) {
        http_response_code(404);
        return;
    }

    header('Content-Type: image/x-icon');
    readfile($iconPath);
    exit;
}

function normalize_date(?string $value): ?string
{
    if (!$value) {
        return null;
    }

    $date = date_create($value);
    if (!$date) {
        return null;
    }

    return $date->format('Y-m-d');
}




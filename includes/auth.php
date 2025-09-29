<?php
declare(strict_types=1);

const PASSWORD_RESET_EXPIRY_MINUTES = 10;

function find_account(string $column, mixed $value, bool $includePassword = false): ?array
{
    $allowed = ['account_id', 'username', 'email'];
    if (!in_array($column, $allowed, true)) {
        throw new InvalidArgumentException('Invalid column for account lookup.');
    }

    $fields = [
        'account_id',
        'username',
        'email',
        'role',
        'gender',
        'date_of_birth',
        'country_of_origin',
        'age',
        'created_at',
        'updated_at',
    ];

    if ($includePassword) {
        $fields[] = 'password';
    }

    $sql = sprintf(
        'SELECT %s FROM accounts WHERE %s = :value LIMIT 1',
        implode(', ', $fields),
        $column
    );

    $stmt = get_db()->prepare($sql);
    if ($column === 'account_id') {
        $value = (int)$value;
    }

    $stmt->execute(['value' => $value]);
    $account = $stmt->fetch();

    return $account !== false ? $account : null;
}

function find_account_by_id(int $id, bool $includePassword = false): ?array
{
    return find_account('account_id', $id, $includePassword);
}

function find_account_by_username(string $username, bool $includePassword = false): ?array
{
    return find_account('username', $username, $includePassword);
}

function find_account_by_email(string $email, bool $includePassword = false): ?array
{
    return find_account('email', $email, $includePassword);
}

function authenticate_user(string $username, string $password): ?array
{
    $account = find_account_by_username($username, true);
    if (!$account) {
        return null;
    }

    $hash = $account['password'] ?? null;
    if (!is_string($hash) || !password_verify($password, $hash)) {
        return null;
    }

    unset($account['password']);
    return $account;
}

function calculate_age(?string $dateOfBirth): ?int
{
    if ($dateOfBirth === null || $dateOfBirth === '') {
        return null;
    }

    $dob = DateTimeImmutable::createFromFormat('Y-m-d', $dateOfBirth);
    if (!$dob) {
        return null;
    }

    $today = new DateTimeImmutable('today');
    $age = (int)$dob->diff($today)->y;
    return $age >= 0 ? $age : null;
}

function create_user(array $data): int
{
    $hash = $data['password_hash'] ?? null;
    if (!is_string($hash) || $hash === '') {
        throw new InvalidArgumentException('Password hash is required.');
    }

    $rawDob = $data['date_of_birth'] ?? null;
    if (is_string($rawDob) && $rawDob !== '') {
        $parsedDob = DateTimeImmutable::createFromFormat('Y-m-d', $rawDob);
        $rawDob = $parsedDob ? $parsedDob->format('Y-m-d') : null;
    } else {
        $rawDob = null;
    }

    $age = calculate_age($rawDob);

    $sql = <<<'SQL'
        INSERT INTO accounts (email, password, role, gender, username, date_of_birth, country_of_origin, age, created_at, updated_at)
        VALUES (:email, :password, :role, :gender, :username, :date_of_birth, :country_of_origin, :age, NOW(), NOW())
    SQL;

    $stmt = get_db()->prepare($sql);
    $stmt->execute([
        'email' => $data['email'],
        'password' => $hash,
        'role' => $data['role'] ?? 'user',
        'gender' => $data['gender'] ?? null,
        'username' => $data['username'],
        'date_of_birth' => $rawDob,
        'country_of_origin' => $data['country_of_origin'] ?? null,
        'age' => $age,
    ]);

    return (int)get_db()->lastInsertId();
}

function update_user_profile(int $accountId, array $data): void
{
    $fields = [
        'email' => $data['email'] ?? null,
        'gender' => $data['gender'] ?? null,
        'date_of_birth' => $data['date_of_birth'] ?? null,
        'country_of_origin' => $data['country_of_origin'] ?? null,
    ];

    if (!empty($data['password_hash'])) {
        $fields['password'] = $data['password_hash'];
    }

    if (array_key_exists('date_of_birth', $fields)) {
        $rawDob = $fields['date_of_birth'];
        if (is_string($rawDob) && $rawDob !== '') {
            $parsedDob = DateTimeImmutable::createFromFormat('Y-m-d', $rawDob);
            $fields['date_of_birth'] = $parsedDob ? $parsedDob->format('Y-m-d') : null;
        } else {
            $fields['date_of_birth'] = null;
        }
        $fields['age'] = calculate_age($fields['date_of_birth']);
    }

    $setParts = [];
    $params = ['account_id' => $accountId];

    foreach ($fields as $column => $value) {
        $setParts[] = sprintf('%s = :%s', $column, $column);
        $params[$column] = $value;
    }

    $setParts[] = 'updated_at = NOW()';

    $sql = 'UPDATE accounts SET ' . implode(', ', $setParts) . ' WHERE account_id = :account_id';
    $stmt = get_db()->prepare($sql);
    $stmt->execute($params);
}

function update_account_password(int $accountId, string $passwordHash): void
{
    $sql = 'UPDATE accounts SET password = :password, updated_at = NOW() WHERE account_id = :account_id';
    $stmt = get_db()->prepare($sql);
    $stmt->execute([
        'password' => $passwordHash,
        'account_id' => $accountId,
    ]);
}

function login_user(array $account): void
{
    $_SESSION['account_id'] = $account['account_id'];
    set_current_user($account);
}

function logout_current_user(): void
{
    unset($_SESSION['account_id']);
    set_current_user(null);
}

function set_current_user(?array $account): void
{
    $GLOBALS['current_user_cache'] = $account;
}

function auth_get_current_user(): ?array
{
    if (array_key_exists('current_user_cache', $GLOBALS)) {
        return $GLOBALS['current_user_cache'];
    }

    $accountId = $_SESSION['account_id'] ?? null;
    if (!$accountId) {
        $GLOBALS['current_user_cache'] = null;
        return null;
    }

    $account = find_account_by_id((int)$accountId);
    $GLOBALS['current_user_cache'] = $account ?: null;
    return $GLOBALS['current_user_cache'];
}

function is_logged_in(): bool
{
    return auth_get_current_user() !== null;
}

function require_login(): array
{
    $account = auth_get_current_user();
    if ($account) {
        return $account;
    }

    add_flash('Please login to continue.', 'error');
    $next = sanitize_redirect_target(request_path());
    redirect('/login?next=' . urlencode($next));
}

function record_password_reset(int $accountId, string $otp, DateTimeImmutable $expiresAt): int
{
    $pdo = get_db();

    $cleanup = $pdo->prepare('DELETE FROM password_resets WHERE account_id = :account_id OR expires_at < NOW()');
    $cleanup->execute(['account_id' => $accountId]);

    $stmt = $pdo->prepare(
        'INSERT INTO password_resets (account_id, otp_hash, expires_at, created_at) VALUES (:account_id, :otp_hash, :expires_at, NOW())'
    );
    $stmt->execute([
        'account_id' => $accountId,
        'otp_hash' => password_hash($otp, PASSWORD_DEFAULT),
        'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
    ]);

    return (int)$pdo->lastInsertId();
}

function issue_password_reset(string $email): ?array
{
    $account = find_account_by_email($email);
    if (!$account) {
        return null;
    }

    $otp = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $expiresAt = (new DateTimeImmutable('now'))->modify('+' . PASSWORD_RESET_EXPIRY_MINUTES . ' minutes');

    $resetId = record_password_reset((int)$account['account_id'], $otp, $expiresAt);

    if (!send_password_reset_email($account['email'], $account['username'] ?? $account['email'], $otp, $expiresAt)) {
        throw new RuntimeException('Unable to send reset email. Please try again later.');
    }

    return [
        'reset_id' => $resetId,
        'account_id' => (int)$account['account_id'],
        'email' => $account['email'],
        'expires_at' => $expiresAt,
    ];
}

function send_password_reset_email(string $toEmail, string $name, string $otp, DateTimeImmutable $expiresAt): bool
{
    $subject = 'Your Places Explorer password reset code';
    $body = sprintf(
        "Hello %s,\n\nHere is your one-time password (OTP) to reset your Places Explorer account: %s\n\nThis code will expire in %d minutes (at %s).\nIf you did not request a reset, please ignore this email.\n\nRegards,\nPlaces Explorer",
        $name,
        $otp,
        PASSWORD_RESET_EXPIRY_MINUTES,
        $expiresAt->format('Y-m-d H:i')
    );

    $headers = [
        'From: no-reply@places-explorer.local',
        'Content-Type: text/plain; charset=UTF-8',
    ];

    return mail($toEmail, $subject, $body, implode("\r\n", $headers));
}

function verify_password_reset(string $email, string $otp): ?array
{
    $account = find_account_by_email($email);
    if (!$account) {
        return null;
    }

    $stmt = get_db()->prepare(
        'SELECT reset_id, account_id, otp_hash, expires_at, consumed_at FROM password_resets WHERE account_id = :account_id ORDER BY reset_id DESC LIMIT 1'
    );
    $stmt->execute(['account_id' => $account['account_id']]);
    $reset = $stmt->fetch();
    if (!$reset) {
        return null;
    }

    if ($reset['consumed_at'] !== null) {
        return null;
    }

    $expiresAt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$reset['expires_at']);
    if (!$expiresAt || $expiresAt < new DateTimeImmutable('now')) {
        return null;
    }

    if (!password_verify($otp, (string)$reset['otp_hash'])) {
        return null;
    }

    return [
        'reset_id' => (int)$reset['reset_id'],
        'account_id' => (int)$reset['account_id'],
        'account' => $account,
    ];
}

function mark_password_reset_consumed(int $resetId): void
{
    $stmt = get_db()->prepare('UPDATE password_resets SET consumed_at = NOW() WHERE reset_id = :reset_id');
    $stmt->execute(['reset_id' => $resetId]);
}
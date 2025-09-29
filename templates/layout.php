<?php
$pageTitle = $pageTitle ?? 'Singapore Garden City';
$pageId = $pageId ?? 'home';
$extraHead = $extraHead ?? '';
$extraScripts = $extraScripts ?? '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= html_escape($pageTitle) ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="/static/css/style.css">
    <script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <?php if ($extraHead): ?>
        <?= $extraHead ?>
    <?php endif; ?>
</head>
<body data-page="<?= html_escape($pageId) ?>">
    <header class="site-header">
        <div class="header-inner">
            <a class="brand" href="/">
                <i class="fas fa-map-marked-alt"></i>
                Welcome to Singapore!
            </a>
            <nav class="primary-nav" aria-label="Primary">
                <ul>
                    <li><a href="/">Home</a></li>
                    <li><a href="/explore">Explore Places</a></li>
                    <?php if (is_logged_in()): ?>
                        <li><a href="/profile">Profile</a></li>
                        <li><a href="/logout">Logout</a></li>
                    <?php else: ?>
                        <li><a class="login-link" href="/login">Login</a></li>
                    <?php endif; ?>
                </ul>
            </nav>
        </div>
    </header>

    <div class="flash-container">
        <?php if (!empty($flashMessages)): ?>
            <ul class="flash-list">
                <?php foreach ($flashMessages as $message): ?>
                    <li class="flash-item <?= html_escape($message['type']) ?>"><?= html_escape($message['message']) ?></li>
                <?php endforeach; ?>
            </ul>
        <?php endif; ?>
    </div>

    <main class="page-content">
        <?= $content ?>
    </main>

    <footer class="site-footer">
        <p>Data provided by <a href="https://data.gov.sg" target="_blank" rel="noopener noreferrer">Data.gov.sg</a></p>
    </footer>

    <script src="/static/js/data.js"></script>
    <script src="/static/js/app.js" defer></script>
    <?php if ($extraScripts): ?>
        <?= $extraScripts ?>
    <?php endif; ?>
</body>
</html>

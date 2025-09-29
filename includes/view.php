<?php
declare(strict_types=1);

function render_template(string $template, array $vars = []): void
{
    $templatePath = __DIR__ . '/../templates/' . $template . '.php';
    if (!is_file($templatePath)) {
        throw new RuntimeException('Template not found: ' . $template);
    }

    $currentUser = auth_get_current_user();
    $flashMessages = consume_flash_messages();

    extract($vars, EXTR_OVERWRITE);

    ob_start();
    include $templatePath;
    $content = ob_get_clean();

    if (!isset($pageTitle) || $pageTitle === '') {
        $pageTitle = 'Singapore Garden City';
    }
    if (!isset($pageId) || $pageId === '') {
        $pageId = 'home';
    }
    if (!isset($extraHead)) {
        $extraHead = '';
    }
    if (!isset($extraScripts)) {
        $extraScripts = '';
    }

    include __DIR__ . '/../templates/layout.php';
}

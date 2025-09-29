<?php
$pageTitle = 'Application Error';
?>
<section class="status-wrapper">
    <div class="status-card error">
        <h1><i class="fas fa-triangle-exclamation"></i> Something went wrong</h1>
        <p>An unexpected error occurred. Please try again later.</p>
        <?php if (!empty($errorMessage)): ?>
            <pre class="error-message"><?= html_escape($errorMessage) ?></pre>
        <?php endif; ?>
        <a class="btn primary" href="/">Return home</a>
    </div>
</section>

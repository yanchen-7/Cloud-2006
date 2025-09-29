<?php
$pageTitle = 'Forgot Password - Places Explorer';
?>
<section class="auth-wrapper">
    <div class="auth-card">
        <h1><i class="fas fa-key"></i> Reset Your Password</h1>
        <p class="auth-subtitle">Enter your account email and we will send a reset link if it exists.</p>
        <form method="post" action="/forgot" class="auth-form">
            <div class="form-field">
                <label for="email">Email</label>
                <input type="email" id="email" name="email" required placeholder="name@example.com" autofocus>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn primary">Send Reset Link</button>
                <a href="/login" class="link">Back to login</a>
            </div>
        </form>
    </div>
</section>

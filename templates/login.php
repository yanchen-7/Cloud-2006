<?php
$pageTitle = 'Login - Places Explorer';
?>
<section class="auth-wrapper">
    <div class="auth-card">
        <h1><i class="fas fa-sign-in-alt"></i> Welcome Back</h1>
        <p class="auth-subtitle">Sign in to access your saved preferences and personalised suggestions.</p>
        <form method="post" action="/login" class="auth-form">
            <div class="form-field">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" required autofocus placeholder="Enter your username">
            </div>
            <div class="form-field">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required placeholder="Enter your password">
            </div>
            <div class="form-actions">
                <button type="submit" class="btn primary">Login</button>
                <a href="/forgot" class="link">Forgot password?</a>
            </div>
        </form>
        <p class="auth-footer">Don't have an account? <a href="/register" class="link">Create one now</a>.</p>
    </div>
</section>

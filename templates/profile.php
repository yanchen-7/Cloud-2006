<?php
$pageTitle = 'Profile - Places Explorer';
?>
<section class="profile-wrapper">
    <div class="profile-card">
        <h1><i class="fas fa-user-circle"></i> Your Profile</h1>
        <p class="auth-subtitle">Update your personal information. Changes are saved to the configured database.</p>
        <form method="post" action="/profile" class="auth-form" novalidate>
            <div class="form-grid">
                <div class="form-field">
                    <label>Username</label>
                    <input type="text" value="<?= html_escape($user['username'] ?? '') ?>" readonly>
                </div>
                <div class="form-field">
                    <label for="email">Email</label>
                    <input type="email" id="email" name="email" required value="<?= html_escape($user['email'] ?? '') ?>">
                </div>
                <div class="form-field">
                    <label for="gender">Gender</label>
                    <select id="gender" name="gender">
                        <?php $gender = $user['gender'] ?? ''; ?>
                        <option value="" <?= $gender === null || $gender === '' ? 'selected' : '' ?>>Prefer not to say</option>
                        <option value="Female" <?= $gender === 'Female' ? 'selected' : '' ?>>Female</option>
                        <option value="Male" <?= $gender === 'Male' ? 'selected' : '' ?>>Male</option>
                        <option value="Non-binary" <?= $gender === 'Non-binary' ? 'selected' : '' ?>>Non-binary</option>
                        <option value="Other" <?= $gender === 'Other' ? 'selected' : '' ?>>Other</option>
                    </select>
                </div>
                <div class="form-field">
                    <label for="date_of_birth">Date of Birth</label>
                    <input type="date" id="date_of_birth" name="date_of_birth" value="<?= html_escape($user['date_of_birth'] ?? '') ?>">
                </div>
                <div class="form-field">
                    <label for="mobile_number">Mobile Number</label>
                    <input type="tel" id="mobile_number" name="mobile_number" value="<?= html_escape($user['mobile_number'] ?? '') ?>">
                </div>
                <div class="form-field">
                    <label for="country_of_origin">Country of Origin</label>
                    <input type="text" id="country_of_origin" name="country_of_origin" value="<?= html_escape($user['country_of_origin'] ?? '') ?>">
                </div>
            </div>

            <fieldset class="password-fields">
                <legend>Reset Password <span>(optional)</span></legend>
                <div class="form-grid">
                    <div class="form-field">
                        <label for="password">New Password</label>
                        <input type="password" id="password" name="password" placeholder="Leave blank to keep current password">
                    </div>
                    <div class="form-field">
                        <label for="confirm_password">Confirm Password</label>
                        <input type="password" id="confirm_password" name="confirm_password" placeholder="Re-enter new password">
                    </div>
                </div>
            </fieldset>

            <div class="form-actions">
                <button type="submit" class="btn primary">Save Changes</button>
            </div>
        </form>
    </div>
</section>

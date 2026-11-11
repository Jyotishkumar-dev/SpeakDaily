/* ============================================
   SpeakDaily — Profile Module
   ============================================ */

let currentProfile = null;

// ─── Fetch Profile ───
async function fetchProfile() {
  if (!AppState.user) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', AppState.user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('fetchProfile error:', error);
    }

    currentProfile = data || {
      id: AppState.user.id,
      full_name: AppState.user.user_metadata?.full_name || AppState.user.email?.split('@')[0] || 'English Learner',
      username: AppState.user.email?.split('@')[0] || 'speaker',
      avatar_url: null,
      streak_count: 0,
      total_sessions: 0,
      created_at: AppState.user.created_at || new Date().toISOString()
    };

    return currentProfile;
  } catch (err) {
    console.error('fetchProfile exception:', err);
    return null;
  }
}

// ─── Update Profile ───
async function updateProfile(data) {
  if (!AppState.user) return false;

  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: AppState.user.id,
        ...data,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    // Also update auth user metadata if full_name changed
    if (data.full_name) {
      await supabase.auth.updateUser({
        data: { full_name: data.full_name }
      });
    }

    return true;
  } catch (err) {
    console.error('updateProfile error:', err);
    throw err;
  }
}

// ─── Render Profile Page ───
async function renderProfile() {
  const container = document.getElementById('profileContent');
  if (!container) return;

  container.innerHTML = `
    <div class="glass-card skeleton-card skeleton mb-3"></div>
    <div class="glass-card skeleton-card skeleton"></div>
  `;

  const profile = await fetchProfile();
  const email = AppState.user?.email || 'user@speakdaily.com';
  const name = profile?.full_name || AppState.user?.user_metadata?.full_name || 'English Speaker';
  const initial = name.charAt(0).toUpperCase();
  const streak = profile?.streak_count || 0;
  const sessions = profile?.total_sessions || 0;
  const joinDate = formatDate(profile?.created_at || new Date());

  container.innerHTML = `
    <!-- Profile Header Card -->
    <div class="glass-card-static profile-header fade-in-up">
      <div class="profile-avatar-large">
        ${initial}
      </div>
      <div class="profile-info">
        <h2>${escapeHtml(name)}</h2>
        <p>📧 ${escapeHtml(email)}</p>
        <p style="margin-top:2px;">📅 Member since ${joinDate}</p>

        <div class="profile-stats-row">
          <div class="profile-stat">
            <span>🔥</span>
            <span><strong>${streak}</strong> day streak</span>
          </div>
          <div class="profile-stat">
            <span>🎙️</span>
            <span><strong>${sessions}</strong> total sessions</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Streak Calendar Heatmap (Last 4 Weeks) -->
    <div class="glass-card fade-in-up mt-3">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h3>🔥 28-Day Practice Consistency</h3>
        <span class="text-muted" style="font-size:12px;">Active Streak: ${streak} days</span>
      </div>
      <p class="text-muted" style="font-size:13px; margin-bottom:16px;">
        Daily speaking builds permanent neural pathways for effortless fluency.
      </p>
      <div class="streak-calendar">
        ${renderStreakCalendar(streak)}
      </div>
    </div>

    <!-- Edit Profile Information -->
    <div class="glass-card fade-in-up mt-3">
      <h3 class="mb-2">👤 Account Information</h3>
      <form id="profileUpdateForm">
        <div class="form-group">
          <label for="profileFullName">Full Name</label>
          <input type="text" id="profileFullName" class="form-input" value="${escapeHtml(name)}" required>
        </div>
        <div class="form-group">
          <label for="profileUsername">Username / Nickname</label>
          <input type="text" id="profileUsername" class="form-input" value="${escapeHtml(profile?.username || '')}">
        </div>
        <div class="form-group">
          <label for="profileEmail">Email Address (Read-only)</label>
          <input type="email" id="profileEmail" class="form-input" value="${escapeHtml(email)}" disabled style="background:#f0f2f5; opacity:0.8;">
        </div>
        <button type="submit" class="btn btn-primary" id="saveProfileBtn">
          💾 Save Changes
        </button>
      </form>
    </div>

    <!-- Change Password Section -->
    <div class="glass-card fade-in-up mt-3">
      <h3 class="mb-2">🔒 Change Password</h3>
      <form id="changePasswordForm">
        <div class="form-group">
          <label for="newPassword">New Password</label>
          <input type="password" id="newPassword" class="form-input" placeholder="Min 6 characters" required>
          <div class="form-error">Password must be at least 6 characters</div>
        </div>
        <div class="form-group">
          <label for="confirmPassword">Confirm New Password</label>
          <input type="password" id="confirmPassword" class="form-input" placeholder="Repeat new password" required>
          <div class="form-error">Passwords do not match</div>
        </div>
        <button type="submit" class="btn btn-outline" id="changePasswordBtn">
          🔑 Update Password
        </button>
      </form>
    </div>
  `;

  setupProfileListeners();
}

// ─── Render 28-day Streak Grid ───
function renderStreakCalendar(streakCount) {
  const days = [];
  const totalDays = 28;
  const activeDaysCount = Math.min(totalDays, Math.max(1, streakCount));

  for (let i = 0; i < totalDays; i++) {
    // Fill the last N days according to streak
    const isActive = i >= (totalDays - activeDaysCount);
    const isPartial = !isActive && Math.random() > 0.65;
    const dayClass = isActive ? 'active' : (isPartial ? 'partial' : '');
    days.push(`<div class="streak-day ${dayClass}" title="Day ${i + 1}"></div>`);
  }

  return days.join('');
}

// ─── Setup Profile Event Listeners ───
function setupProfileListeners() {
  const profileForm = document.getElementById('profileUpdateForm');
  const passwordForm = document.getElementById('changePasswordForm');

  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('saveProfileBtn');
      const fullName = document.getElementById('profileFullName').value.trim();
      const username = document.getElementById('profileUsername').value.trim();

      if (!fullName) {
        showToast('Full name cannot be empty', 'warning');
        return;
      }

      btn.classList.add('loading');
      btn.innerHTML = '<span class="spinner"></span> Saving...';

      try {
        await updateProfile({ full_name: fullName, username: username });
        showToast('Profile updated successfully! ✨', 'success');
        updateNav();
      } catch (err) {
        showToast('Failed to update profile: ' + (err.message || 'Error'), 'error');
      } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '💾 Save Changes';
      }
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('changePasswordBtn');
      const newPwd = document.getElementById('newPassword');
      const confirmPwd = document.getElementById('confirmPassword');

      clearAllErrors(passwordForm);

      let valid = true;
      if (newPwd.value.length < 6) {
        showFieldError(newPwd, 'Password must be at least 6 characters');
        valid = false;
      }
      if (newPwd.value !== confirmPwd.value) {
        showFieldError(confirmPwd, 'Passwords do not match');
        valid = false;
      }

      if (!valid) return;

      btn.classList.add('loading');
      btn.innerHTML = '<span class="spinner"></span> Updating...';

      try {
        const { error } = await supabase.auth.updateUser({
          password: newPwd.value
        });

        if (error) throw error;

        showToast('Password updated successfully! 🔒', 'success');
        newPwd.value = '';
        confirmPwd.value = '';
      } catch (err) {
        showToast('Password update failed: ' + (err.message || 'Error'), 'error');
      } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '🔑 Update Password';
      }
    });
  }
}


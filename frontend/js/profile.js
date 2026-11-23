/* ============================================
   SpeakDaily — Profile & Settings Module
   ============================================ */

let currentProfile = null;

// ─── Fetch Profile ───
async function fetchProfile() {
  if (!AppState.user) {
    // Guest mode profile fallback
    const guestSessionsCount = (JSON.parse(localStorage.getItem('speakdaily_guest_sessions') || '[]')).length;
    return {
      id: 'guest',
      full_name: 'Guest Speaker',
      username: 'guest',
      avatar_url: null,
      streak_count: guestSessionsCount > 0 ? 1 : 0,
      total_sessions: guestSessionsCount,
      created_at: new Date().toISOString()
    };
  }

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
  if (!AppState.user) {
    showToast('Saved profile locally in guest mode', 'info');
    return true;
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: AppState.user.id,
        ...data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) throw error;

    // Also update auth user metadata if full_name changed
    if (data.full_name) {
      await supabase.auth.updateUser({
        data: { full_name: data.full_name }
      });
      if (AppState.user.user_metadata) {
        AppState.user.user_metadata.full_name = data.full_name;
      }
    }

    return true;
  } catch (err) {
    console.error('updateProfile error:', err);
    throw err;
  }
}

// ─── Fetch 28-Day Consistency Activity ───
async function fetch28DayActivity() {
  const days = [];
  const today = new Date();
  const sessionCountByDate = {};

  // Build the 28 days ending today
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    sessionCountByDate[dateStr] = 0;
    days.push({
      dateStr: dateStr,
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isToday: i === 0,
      count: 0,
      level: 0
    });
  }

  if (!AppState.user) {
    // In guest mode, read from localStorage
    try {
      const raw = localStorage.getItem('speakdaily_guest_sessions');
      if (raw) {
        const guestSessions = JSON.parse(raw);
        guestSessions.forEach(s => {
          const date = s.created_at?.split('T')[0];
          if (date && sessionCountByDate.hasOwnProperty(date)) {
            sessionCountByDate[date] = (sessionCountByDate[date] || 0) + 1;
          }
        });
      }
    } catch (e) { }
  } else {
    try {
      const cutoffDate = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
      const { data: sessions } = await supabase
        .from('practice_sessions')
        .select('created_at')
        .eq('user_id', AppState.user.id)
        .gte('created_at', cutoffDate);

      if (sessions && sessions.length > 0) {
        sessions.forEach(s => {
          const date = s.created_at?.split('T')[0];
          if (date && sessionCountByDate.hasOwnProperty(date)) {
            sessionCountByDate[date] = (sessionCountByDate[date] || 0) + 1;
          }
        });
      }
    } catch (err) {
      console.warn('fetch28DayActivity error:', err);
    }
  }

  // Assign counts and level tiers (0 to 3)
  days.forEach(day => {
    day.count = sessionCountByDate[day.dateStr] || 0;
    if (day.count === 0) day.level = 0;
    else if (day.count === 1) day.level = 1;
    else if (day.count === 2) day.level = 2;
    else day.level = 3;
  });

  return days;
}

// ─── Render 28-day Streak Grid ───
function renderStreakCalendar(activityDays) {
  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const cellsHtml = activityDays.map(d => {
    const tooltip = `${d.count} session${d.count !== 1 ? 's' : ''} on ${d.dateLabel}`;
    return `
      <div class="streak-day lvl-${d.level} ${d.isToday ? 'is-today' : ''}" title="${tooltip}"></div>
    `;
  }).join('');

  return `
    <div class="heatmap-wrapper">
      <div class="heatmap-header-days">
        ${dayHeaders.map(dh => `<span>${dh}</span>`).join('')}
      </div>
      <div class="streak-calendar">
        ${cellsHtml}
      </div>
      <div class="heatmap-footer-legend">
        <span>Consistency builds fluency</span>
        <div class="heatmap-legend-scale">
          <span>Less</span>
          <div class="legend-box lvl-0" style="background:rgba(0,0,0,0.04);"></div>
          <div class="legend-box lvl-1" style="background:rgba(0,184,148,0.25);"></div>
          <div class="legend-box lvl-2" style="background:rgba(0,184,148,0.65);"></div>
          <div class="legend-box lvl-3" style="background:#00B894;"></div>
          <span>More</span>
        </div>
      </div>
    </div>
  `;
}

// ─── Render Profile Page ───
async function renderProfile() {
  const container = document.getElementById('profileContent');
  if (!container) return;

  container.innerHTML = `
    <div class="glass-card skeleton-card skeleton mb-3" style="height:140px;"></div>
    <div class="glass-card skeleton-card skeleton mb-3" style="height:200px;"></div>
    <div class="glass-card skeleton-card skeleton" style="height:200px;"></div>
  `;

  const [profile, activityDays] = await Promise.all([
    fetchProfile(),
    fetch28DayActivity()
  ]);

  const email = AppState.user?.email || 'Guest Mode (Not Signed In)';
  const name = profile?.full_name || AppState.user?.user_metadata?.full_name || 'English Speaker';
  const initial = name.charAt(0).toUpperCase();
  const streak = profile?.streak_count || 0;
  const sessions = profile?.total_sessions || 0;
  const joinDate = formatDate(profile?.created_at || new Date());

  // Determine Fluency & Streak Badges
  let fluencyBadge = '🌱 Beginner Explorer';
  if (sessions >= 15 || streak >= 7) {
    fluencyBadge = '🌟 Fluent Speaker';
  } else if (sessions >= 5 || streak >= 3) {
    fluencyBadge = '🚀 Dedicated Learner';
  }

  // Load saved learning preferences from localStorage
  const savedGoal = localStorage.getItem('speakdaily_goal_mins') || '5';
  const savedAccent = localStorage.getItem('speakdaily_accent_pref') || 'general';

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

        <div class="profile-badges-row">
          <span class="profile-badge">${fluencyBadge}</span>
          <span class="profile-badge">🔥 ${streak} Day Streak</span>
          <span class="profile-badge">🎙️ ${sessions} Sessions</span>
        </div>
      </div>
    </div>

    <!-- Streak Calendar Heatmap (Last 4 Weeks / 28 Days) -->
    <div class="glass-card fade-in-up mt-3">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <h3>🔥 28-Day Practice Consistency Heatmap</h3>
        <span class="text-muted" style="font-size:12px;">Active Streak: ${streak} days</span>
      </div>
      <p class="text-muted" style="font-size:13px; margin-bottom:8px;">
        Daily 5-minute speaking builds permanent neural pathways for spontaneous, natural articulation.
      </p>
      ${renderStreakCalendar(activityDays)}
    </div>

    <!-- Edit Profile & Preferences -->
    <div class="glass-card fade-in-up mt-3">
      <h3 class="mb-2">👤 Account &amp; Speaking Preferences</h3>
      <form id="profileUpdateForm">
        <div class="form-group">
          <label for="profileFullName">Full Name</label>
          <input type="text" id="profileFullName" class="form-input" value="${escapeHtml(name)}" required autocomplete="name">
        </div>

        <div class="form-group">
          <label for="profileUsername">Username / Nickname</label>
          <input type="text" id="profileUsername" class="form-input" value="${escapeHtml(profile?.username || '')}">
        </div>

        <div class="form-group">
          <label for="profileGoal">Daily Practice Target</label>
          <select id="profileGoal" class="form-input">
            <option value="5" ${savedGoal === '5' ? 'selected' : ''}>⚡ 5 Minutes / Day (Recommended)</option>
            <option value="10" ${savedGoal === '10' ? 'selected' : ''}>🎯 10 Minutes / Day</option>
            <option value="15" ${savedGoal === '15' ? 'selected' : ''}>🚀 15 Minutes / Day (Intensive)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="profileAccent">Speaking Focus / Accent Target</label>
          <select id="profileAccent" class="form-input">
            <option value="general" ${savedAccent === 'general' ? 'selected' : ''}>🗣️ General Conversational English</option>
            <option value="business" ${savedAccent === 'business' ? 'selected' : ''}>💼 International Business English</option>
            <option value="interview" ${savedAccent === 'interview' ? 'selected' : ''}>🎯 Job Interviews &amp; Career Pitching</option>
            <option value="ielts" ${savedAccent === 'ielts' ? 'selected' : ''}>🎓 IELTS / TOEFL Speaking Test Prep</option>
          </select>
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

    <!-- Change Password Section (Only for registered users) -->
    ${AppState.user ? `
      <div class="glass-card fade-in-up mt-3">
        <h3 class="mb-2">🔒 Change Password</h3>
        <form id="changePasswordForm">
          <div class="form-group">
            <label for="newPassword">New Password</label>
            <div class="input-password-wrap">
              <input type="password" id="newPassword" class="form-input" placeholder="Min 6 characters" required autocomplete="new-password">
              <button type="button" class="btn-password-toggle" data-target="newPassword" aria-label="Toggle password visibility">
                ${EYE_ICON}
              </button>
            </div>
            <div class="form-error">Password must be at least 6 characters</div>
          </div>

          <div class="form-group">
            <label for="confirmPassword">Confirm New Password</label>
            <div class="input-password-wrap">
              <input type="password" id="confirmPassword" class="form-input" placeholder="Repeat new password" required autocomplete="new-password">
              <button type="button" class="btn-password-toggle" data-target="confirmPassword" aria-label="Toggle password visibility">
                ${EYE_ICON}
              </button>
            </div>
            <div class="form-error">Passwords do not match</div>
          </div>

          <button type="submit" class="btn btn-outline" id="changePasswordBtn">
            🔑 Update Password
          </button>
        </form>
      </div>
    ` : ''}

    <!-- Danger Zone / Sign Out -->
    <div class="glass-card danger-zone-card fade-in-up">
      <h3 style="color:var(--color-danger); margin-bottom:8px;">⚠️ Account Actions</h3>
      <p style="font-size:13px; color:var(--color-dark-light); margin-bottom:16px;">
        ${AppState.user ? 'Sign out of your active session or reset device preferences.' : 'Clear local guest practice sessions saved in this browser.'}
      </p>
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        ${AppState.user ? `
          <button class="btn btn-outline" onclick="handleSignOut()">
            👋 Sign Out
          </button>
        ` : `
          <button class="btn btn-outline" onclick="clearGuestCache()">
            🧹 Clear Guest Practice Cache
          </button>
        `}
      </div>
    </div>
  `;

  // Attach password toggle buttons
  attachPasswordToggles(container);

  setupProfileListeners();
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
      const goal = document.getElementById('profileGoal')?.value || '5';
      const accent = document.getElementById('profileAccent')?.value || 'general';

      if (!fullName) {
        showToast('Full name cannot be empty', 'warning');
        return;
      }

      // Save preferences to localStorage
      localStorage.setItem('speakdaily_goal_mins', goal);
      localStorage.setItem('speakdaily_accent_pref', accent);

      btn.classList.add('loading');
      btn.innerHTML = '<span class="spinner"></span> Saving...';

      try {
        await updateProfile({ full_name: fullName, username: username });
        showToast('Profile & preferences updated successfully! ✨', 'success');
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

// ─── Clear Guest Cache Helper ───
window.clearGuestCache = function () {
  if (confirm('Clear all local practice sessions saved on this device?')) {
    localStorage.removeItem('speakdaily_guest_sessions');
    showToast('Local guest sessions cleared 🧹', 'info');
    renderProfile();
  }
};

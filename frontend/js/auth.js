/* ============================================
   SpeakDaily — Authentication Module
   ============================================ */

// Icons for password toggling
const EYE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const EYE_OFF_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

// ─── Sign Up ───
async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });

  if (error) throw error;
  return data;
}

// ─── Sign In ───
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

// ─── Sign Out ───
async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.warn('Supabase signOut warning:', error);
    } catch (err) {
      console.warn('Sign out exception:', err);
    }

    AppState.user = null;
    AppState.session = null;
    showToast('Signed out successfully 👋', 'success');
    updateNav();
    navigate('landing');
  }
  window.handleSignOut = handleSignOut;

  // ─── Get Current User ───
  async function getCurrentUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    } catch (e) {
      return null;
    }
  }

  // ─── Form Validation & Password Strength ───
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validatePassword(password) {
    return typeof password === 'string' && password.length >= 6;
  }

  function evaluatePasswordStrength(password) {
    if (!password || password.length === 0) return { score: 0, label: '', colorClass: '' };
    if (password.length < 6) return { score: 1, label: 'Too short', colorClass: 'weak' };

    let score = 1;
    const hasMixed = /[a-z]/.test(password) && /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);

    if (password.length >= 8 && (hasMixed || (hasNumbers && hasSpecial))) {
      score = 3;
      return { score: 3, label: 'Strong', colorClass: 'strong' };
    } else if (password.length >= 6 && (hasNumbers || hasMixed)) {
      score = 2;
      return { score: 2, label: 'Good', colorClass: 'medium' };
    }

    return { score: 1, label: 'Weak', colorClass: 'weak' };
  }

  // ─── Password Toggle Setup ───
  function attachPasswordToggles(cardElement) {
    if (!cardElement) return;
    cardElement.querySelectorAll('.btn-password-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword ? EYE_OFF_ICON : EYE_ICON;
        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      });
    });
  }

  // ─── Local Guest Sessions Checker ───
  function getGuestSessionsCount() {
    try {
      const raw = localStorage.getItem('speakdaily_guest_sessions');
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch (e) {
      return 0;
    }
  }

  // ─── Guest Sessions to Cloud Migration ───
  async function syncGuestSessions(user) {
    if (!user || !user.id) return 0;

    let guestSessions = [];
    try {
      const raw = localStorage.getItem('speakdaily_guest_sessions');
      if (raw) guestSessions = JSON.parse(raw);
    } catch (e) {
      console.warn('Guest sessions sync read error:', e);
      return 0;
    }

    if (!Array.isArray(guestSessions) || guestSessions.length === 0) {
      return 0;
    }

    console.log(`Initiating sync of ${guestSessions.length} guest session(s) to Supabase account...`);

    try {
      // 1. Ensure profile exists in public.profiles table
      const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: fullName,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id', ignoreDuplicates: true });

      let migrated = 0;
      const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

      for (const s of guestSessions) {
        if (!s.transcript) continue;

        const sessionPayload = {
          user_id: user.id,
          topic_id: isUuid(s.topic_id) ? s.topic_id : null,
          topic_title: s.topic_title || 'Guest Practice Session',
          transcript: s.transcript,
          duration_seconds: s.duration_seconds || 45,
          created_at: s.created_at || new Date().toISOString()
        };

        let { data: insertedSess, error: sessErr } = await supabase
          .from('practice_sessions')
          .insert(sessionPayload)
          .select('id')
          .single();

        // If topic_title is rejected by unmigrated DB, retry without topic_title
        if (sessErr && sessErr.message && sessErr.message.includes('topic_title')) {
          delete sessionPayload.topic_title;
          const retryRes = await supabase
            .from('practice_sessions')
            .insert(sessionPayload)
            .select('id')
            .single();
          insertedSess = retryRes.data;
          sessErr = retryRes.error;
        }

        if (sessErr) {
          console.warn('Session insert failed during guest migration:', sessErr);
          continue;
        }

        if (insertedSess && insertedSess.id && s.feedback) {
          const fb = s.feedback;
          await supabase
            .from('ai_feedback')
            .insert({
              session_id: insertedSess.id,
              overall_score: fb.overall_score || 70,
              grammar_score: fb.grammar_score || 70,
              fluency_score: fb.fluency_score || 70,
              pronunciation_score: fb.pronunciation_score || 70,
              corrections: fb.corrections || [],
              suggestions: fb.suggestions || [],
              encouraging_message: fb.encouraging_message || 'Great effort during practice!'
            });
        }

        migrated++;
      }

      if (migrated > 0) {
        // Update profile stats
        const { data: prof } = await supabase
          .from('profiles')
          .select('streak_count, total_sessions')
          .eq('id', user.id)
          .maybeSingle();

        if (prof) {
          await supabase
            .from('profiles')
            .update({
              total_sessions: (prof.total_sessions || 0) + migrated,
              streak_count: Math.max(1, (prof.streak_count || 0) + 1),
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);
        }

        // Clear guest sessions after successful cloud sync
        localStorage.removeItem('speakdaily_guest_sessions');

        showToast(`🎉 Migrated ${migrated} guest session${migrated > 1 ? 's' : ''} to your cloud account!`, 'success', 5000);
        showConfetti();
      }

      return migrated;
    } catch (syncErr) {
      console.warn('Sync guest sessions caught error:', syncErr);
      return 0;
    }
  }
  window.syncGuestSessions = syncGuestSessions;

  // ─── Human-friendly Auth Error Parser ───
  function formatAuthError(err) {
    if (!err) return 'An unexpected error occurred. Please try again.';
    const msg = err.message || String(err);

    if (msg.toLowerCase().includes('invalid login credentials')) {
      return 'Incorrect email or password. Please verify and try again.';
    }
    if (msg.toLowerCase().includes('email not confirmed')) {
      return 'Please confirm your email address! A verification link was sent to your inbox.';
    }
    if (msg.toLowerCase().includes('user already registered') || msg.toLowerCase().includes('already registered')) {
      return 'An account with this email already exists. Try signing in instead!';
    }
    if (msg.toLowerCase().includes('password should be at least')) {
      return 'Password must be at least 6 characters.';
    }
    if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many requests')) {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror')) {
      return 'Could not connect to authentication server. Please check your internet connection.';
    }
    return msg;
  }

  // ─── Render Login Page ───
  function renderLoginPage() {
    const card = document.getElementById('loginCard');
    if (!card) return;

    const guestCount = getGuestSessionsCount();
    const guestBannerHtml = guestCount > 0 ? `
    <div class="guest-sync-banner">
      <div class="banner-icon">💡</div>
      <div>
        <strong>${guestCount} guest practice session${guestCount > 1 ? 's' : ''}</strong> saved on this device. Sign in to permanently save your progress to the cloud!
      </div>
    </div>
  ` : '';

    card.innerHTML = `
    <div class="auth-header">
      <div class="emoji">👋</div>
      <h2>Welcome Back!</h2>
      <p>Sign in to continue your English speaking practice</p>
    </div>

    ${guestBannerHtml}

    <div style="text-align: center;">
      <button type="button" class="demo-login-chip" id="demoFillBtn" title="Auto-fill demo test credentials">
        ⚡ Fill Demo Credentials
      </button>
    </div>

    <form id="loginForm" novalidate>
      <div class="form-group">
        <label for="loginEmail">Email Address</label>
        <input type="email" id="loginEmail" class="form-input" placeholder="your@email.com" required autocomplete="email">
        <div class="form-error">Please enter a valid email</div>
      </div>

      <div class="form-group">
        <label for="loginPassword">Password</label>
        <div class="input-password-wrap">
          <input type="password" id="loginPassword" class="form-input" placeholder="Your password" required autocomplete="current-password">
          <button type="button" class="btn-password-toggle" data-target="loginPassword" aria-label="Toggle password visibility">
            ${EYE_ICON}
          </button>
        </div>
        <div class="form-error">Password must be at least 6 characters</div>
      </div>

      <div class="auth-sublink-row">
        <a href="javascript:void(0)" class="auth-sublink" id="forgotPasswordLink">Forgot password?</a>
      </div>

      <button type="submit" class="btn btn-primary btn-block btn-lg" id="loginSubmitBtn">
        Sign In 🚀
      </button>
    </form>

    <div class="auth-footer">
      Don't have an account? <a href="#signup">Create one for free ✨</a>
    </div>
  `;

    // Attach toggles
    attachPasswordToggles(card);

    // Demo auto-fill button
    const demoBtn = document.getElementById('demoFillBtn');
    demoBtn?.addEventListener('click', () => {
      document.getElementById('loginEmail').value = 'demo@speakdaily.com';
      document.getElementById('loginPassword').value = 'SpeakDaily123!';
      showToast('Demo credentials filled! Click Sign In or Create Account.', 'info', 3000);
    });

    // Forgot password trigger
    const forgotLink = document.getElementById('forgotPasswordLink');
    forgotLink?.addEventListener('click', renderForgotPasswordPage);

    // Login form submit
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', handleLogin);
  }

  // ─── Handle Login ───
  async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const btn = document.getElementById('loginSubmitBtn');
    const email = document.getElementById('loginEmail');
    const password = document.getElementById('loginPassword');

    clearAllErrors(form);

    let valid = true;

    if (!validateEmail(email.value.trim())) {
      showFieldError(email, 'Please enter a valid email address');
      valid = false;
    }
    if (!validatePassword(password.value)) {
      showFieldError(password, 'Password must be at least 6 characters');
      valid = false;
    }

    if (!valid) return;

    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';

    try {
      const data = await signIn(email.value.trim(), password.value);

      AppState.user = data.user;
      AppState.session = data.session;

      showToast('Welcome back! 🎉', 'success');

      // Sync any guest sessions from this device
      await syncGuestSessions(data.user);

      updateNav();
      navigate('dashboard');
    } catch (err) {
      const friendlyMsg = formatAuthError(err);
      showToast(friendlyMsg, 'error', 5000);
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.innerHTML = 'Sign In 🚀';
    }
  }

  // ─── Render Signup Page ───
  function renderSignupPage() {
    const card = document.getElementById('signupCard');
    if (!card) return;

    const guestCount = getGuestSessionsCount();
    const guestBannerHtml = guestCount > 0 ? `
    <div class="guest-sync-banner">
      <div class="banner-icon">🎯</div>
      <div>
        <strong>${guestCount} guest practice session${guestCount > 1 ? 's' : ''}</strong> will automatically be saved to your new account upon sign up!
      </div>
    </div>
  ` : '';

    card.innerHTML = `
    <div class="auth-header">
      <div class="emoji">🚀</div>
      <h2>Join SpeakDaily</h2>
      <p>Start your 5-minute daily English speaking habit</p>
    </div>

    ${guestBannerHtml}

    <form id="signupForm" novalidate>
      <div class="form-group">
        <label for="signupName">Full Name</label>
        <input type="text" id="signupName" class="form-input" placeholder="e.g. Jyotish Verma" required autocomplete="name">
        <div class="form-error">Please enter your name</div>
      </div>

      <div class="form-group">
        <label for="signupEmail">Email Address</label>
        <input type="email" id="signupEmail" class="form-input" placeholder="your@email.com" required autocomplete="email">
        <div class="form-error">Please enter a valid email</div>
      </div>

      <div class="form-group">
        <label for="signupPassword">Password</label>
        <div class="input-password-wrap">
          <input type="password" id="signupPassword" class="form-input" placeholder="At least 6 characters" required autocomplete="new-password">
          <button type="button" class="btn-password-toggle" data-target="signupPassword" aria-label="Toggle password visibility">
            ${EYE_ICON}
          </button>
        </div>
        <div class="password-strength-wrap" id="passwordStrengthWrap" style="display:none;">
          <div class="password-strength-bars">
            <div class="strength-bar" id="strBar1"></div>
            <div class="strength-bar" id="strBar2"></div>
            <div class="strength-bar" id="strBar3"></div>
          </div>
          <span class="strength-label" id="strLabel">Weak</span>
        </div>
        <div class="form-error">Password must be at least 6 characters</div>
      </div>

      <div class="form-group">
        <label for="signupConfirm">Confirm Password</label>
        <div class="input-password-wrap">
          <input type="password" id="signupConfirm" class="form-input" placeholder="Repeat your password" required autocomplete="new-password">
          <button type="button" class="btn-password-toggle" data-target="signupConfirm" aria-label="Toggle password visibility">
            ${EYE_ICON}
          </button>
        </div>
        <div class="form-error">Passwords do not match</div>
      </div>

      <button type="submit" class="btn btn-primary btn-block btn-lg" id="signupSubmitBtn">
        Create Account ✨
      </button>
    </form>

    <div class="auth-footer">
      Already have an account? <a href="#login">Sign in</a>
    </div>
  `;

    attachPasswordToggles(card);

    // Live password strength feedback
    const pwdInput = document.getElementById('signupPassword');
    const strWrap = document.getElementById('passwordStrengthWrap');
    const b1 = document.getElementById('strBar1');
    const b2 = document.getElementById('strBar2');
    const b3 = document.getElementById('strBar3');
    const strLabel = document.getElementById('strLabel');

    pwdInput?.addEventListener('input', () => {
      const val = pwdInput.value;
      if (!val) {
        strWrap.style.display = 'none';
        return;
      }
      strWrap.style.display = 'flex';
      const evalResult = evaluatePasswordStrength(val);

      b1.className = 'strength-bar';
      b2.className = 'strength-bar';
      b3.className = 'strength-bar';

      if (evalResult.score >= 1) b1.classList.add(evalResult.colorClass);
      if (evalResult.score >= 2) b2.classList.add(evalResult.colorClass);
      if (evalResult.score >= 3) b3.classList.add(evalResult.colorClass);

      strLabel.textContent = evalResult.label;
      strLabel.style.color = evalResult.score === 3 ? '#00B894' : (evalResult.score === 2 ? '#FDCB6E' : '#e17055');
    });

    // Signup form submit
    const form = document.getElementById('signupForm');
    form.addEventListener('submit', handleSignup);
  }

  // ─── Handle Signup ───
  async function handleSignup(e) {
    e.preventDefault();
    const form = e.target;
    const btn = document.getElementById('signupSubmitBtn');
    const name = document.getElementById('signupName');
    const email = document.getElementById('signupEmail');
    const password = document.getElementById('signupPassword');
    const confirm = document.getElementById('signupConfirm');

    clearAllErrors(form);

    let valid = true;

    if (!name.value.trim()) {
      showFieldError(name, 'Please enter your full name');
      valid = false;
    }
    if (!validateEmail(email.value.trim())) {
      showFieldError(email, 'Please enter a valid email address');
      valid = false;
    }
    if (!validatePassword(password.value)) {
      showFieldError(password, 'Password must be at least 6 characters');
      valid = false;
    }
    if (password.value !== confirm.value) {
      showFieldError(confirm, 'Passwords do not match');
      valid = false;
    }

    if (!valid) return;

    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';

    try {
      const data = await signUp(email.value.trim(), password.value, name.value.trim());

      // If Supabase has email confirmation disabled, a session is directly returned
      if (data?.session && data?.user) {
        AppState.user = data.user;
        AppState.session = data.session;

        showToast('Account created successfully! Welcome 🎉', 'success');
        await syncGuestSessions(data.user);
        updateNav();
        navigate('dashboard');
        return;
      }

      // If email confirmation is enabled, display friendly instructions
      const card = document.getElementById('signupCard');
      card.innerHTML = `
      <div class="auth-header">
        <div class="emoji">📧</div>
        <h2>Verify Your Email</h2>
        <p>We've sent a verification link to:</p>
        <p style="font-weight:700; color:var(--color-primary); font-size:16px; margin: 8px 0;">${escapeHtml(email.value.trim())}</p>
      </div>

      <div class="auth-note" style="margin-bottom: 24px; font-size: 14px; background: rgba(108,99,255,0.06); padding: 14px; border-radius: var(--radius-md);">
        Please check your inbox (and spam folder) and click the link to activate your SpeakDaily account. Once verified, click below to sign in!
      </div>

      <a href="#login" class="btn btn-primary btn-block btn-lg">
        Go to Sign In 🚀
      </a>
      <div class="auth-footer" style="margin-top: 16px;">
        Wrong email? <a href="javascript:void(0)" id="reSignUpLink">Try again</a>
      </div>
    `;

      document.getElementById('reSignUpLink')?.addEventListener('click', renderSignupPage);

      showToast('Verification email sent! Check your inbox 📬', 'info', 5000);
    } catch (err) {
      const friendlyMsg = formatAuthError(err);
      showToast(friendlyMsg, 'error', 5000);
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.innerHTML = 'Create Account ✨';
    }
  }

  // ─── Render Forgot Password Page ───
  function renderForgotPasswordPage() {
    const card = document.getElementById('loginCard');
    if (!card) return;

    card.innerHTML = `
    <div class="auth-header">
      <div class="emoji">🔐</div>
      <h2>Reset Password</h2>
      <p>Enter your registered email and we'll send a password recovery link</p>
    </div>

    <form id="forgotForm" novalidate>
      <div class="form-group">
        <label for="forgotEmail">Email Address</label>
        <input type="email" id="forgotEmail" class="form-input" placeholder="your@email.com" required autocomplete="email">
        <div class="form-error">Please enter a valid email</div>
      </div>

      <button type="submit" class="btn btn-primary btn-block btn-lg" id="forgotSubmitBtn">
        Send Recovery Link 📩
      </button>
    </form>

    <div class="auth-footer">
      Remember your password? <a href="javascript:void(0)" id="backToSignInLink">Back to Sign In</a>
    </div>
  `;

    document.getElementById('backToSignInLink')?.addEventListener('click', renderLoginPage);

    const form = document.getElementById('forgotForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgotEmail');
      const btn = document.getElementById('forgotSubmitBtn');
      clearAllErrors(form);

      if (!validateEmail(email.value.trim())) {
        showFieldError(email, 'Please enter a valid email address');
        return;
      }

      btn.classList.add('loading');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Sending link...';

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.value.trim(), {
          redirectTo: window.location.origin + '/#profile'
        });
        if (error) throw error;

        card.innerHTML = `
        <div class="auth-header">
          <div class="emoji">📬</div>
          <h2>Check Your Inbox</h2>
          <p>If an account exists for <strong>${escapeHtml(email.value.trim())}</strong>, we have sent password reset instructions.</p>
        </div>
        <button type="button" class="btn btn-primary btn-block btn-lg" id="returnToLoginBtn">
          Back to Sign In
        </button>
      `;
        document.getElementById('returnToLoginBtn')?.addEventListener('click', renderLoginPage);
        showToast('Reset link sent! Please check your email 📧', 'success');
      } catch (err) {
        showToast(formatAuthError(err), 'error');
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.innerHTML = 'Send Recovery Link 📩';
      }
    });
  }

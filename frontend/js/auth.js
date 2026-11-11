/* ============================================
   SpeakDaily — Authentication Module
   ============================================ */

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
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast('Failed to sign out', 'error');
    return;
  }
  AppState.user = null;
  AppState.session = null;
  showToast('Signed out successfully 👋', 'success');
  navigate('landing');
}

// ─── Get Current User ───
async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ─── Form Validation ───
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return password.length >= 6;
}

function showFieldError(field, message) {
  const errorEl = field.parentElement.querySelector('.form-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  }
  field.classList.add('error');
}

function clearFieldError(field) {
  const errorEl = field.parentElement.querySelector('.form-error');
  if (errorEl) {
    errorEl.classList.remove('visible');
  }
  field.classList.remove('error');
}

function clearAllErrors(form) {
  form.querySelectorAll('.form-error').forEach(e => e.classList.remove('visible'));
  form.querySelectorAll('.form-input').forEach(e => e.classList.remove('error'));
}

// ─── Render Login Page ───
function renderLoginPage() {
  const card = document.getElementById('loginCard');
  card.innerHTML = `
    <div class="auth-header">
      <div class="emoji">👋</div>
      <h2>Welcome Back!</h2>
      <p>Sign in to continue your practice</p>
    </div>
    <form id="loginForm">
      <div class="form-group">
        <label for="loginEmail">Email</label>
        <input type="email" id="loginEmail" class="form-input" placeholder="your@email.com" required autocomplete="email">
        <div class="form-error">Please enter a valid email</div>
      </div>
      <div class="form-group">
        <label for="loginPassword">Password</label>
        <input type="password" id="loginPassword" class="form-input" placeholder="Your password" required autocomplete="current-password">
        <div class="form-error">Password must be at least 6 characters</div>
      </div>
      <button type="submit" class="btn btn-primary btn-block btn-lg" id="loginSubmitBtn">
        Sign In 🚀
      </button>
    </form>
    <div class="auth-footer">
      Don't have an account? <a href="#signup">Create one</a>
    </div>
  `;

  const form = document.getElementById('loginForm');
  form.addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('loginSubmitBtn');
  const email = document.getElementById('loginEmail');
  const password = document.getElementById('loginPassword');

  clearAllErrors(form);

  let valid = true;

  if (!validateEmail(email.value.trim())) {
    showFieldError(email, 'Please enter a valid email');
    valid = false;
  }
  if (!validatePassword(password.value)) {
    showFieldError(password, 'Password must be at least 6 characters');
    valid = false;
  }

  if (!valid) return;

  btn.classList.add('loading');
  btn.innerHTML = '<span class="spinner"></span> Signing in...';

  try {
    await signIn(email.value.trim(), password.value);
    showToast('Welcome back! 🎉', 'success');
    navigate('dashboard');
  } catch (err) {
    showToast(err.message || 'Sign in failed', 'error');
    btn.classList.remove('loading');
    btn.innerHTML = 'Sign In 🚀';
  }
}

// ─── Render Signup Page ───
function renderSignupPage() {
  const card = document.getElementById('signupCard');
  card.innerHTML = `
    <div class="auth-header">
      <div class="emoji">🚀</div>
      <h2>Join SpeakDaily</h2>
      <p>Start your English speaking journey today</p>
    </div>
    <form id="signupForm">
      <div class="form-group">
        <label for="signupName">Full Name</label>
        <input type="text" id="signupName" class="form-input" placeholder="Your name" required autocomplete="name">
        <div class="form-error">Please enter your name</div>
      </div>
      <div class="form-group">
        <label for="signupEmail">Email</label>
        <input type="email" id="signupEmail" class="form-input" placeholder="your@email.com" required autocomplete="email">
        <div class="form-error">Please enter a valid email</div>
      </div>
      <div class="form-group">
        <label for="signupPassword">Password</label>
        <input type="password" id="signupPassword" class="form-input" placeholder="Min 6 characters" required autocomplete="new-password">
        <div class="form-error">Password must be at least 6 characters</div>
      </div>
      <div class="form-group">
        <label for="signupConfirm">Confirm Password</label>
        <input type="password" id="signupConfirm" class="form-input" placeholder="Repeat password" required autocomplete="new-password">
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

  const form = document.getElementById('signupForm');
  form.addEventListener('submit', handleSignup);
}

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
    showFieldError(name, 'Please enter your name');
    valid = false;
  }
  if (!validateEmail(email.value.trim())) {
    showFieldError(email, 'Please enter a valid email');
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
  btn.innerHTML = '<span class="spinner"></span> Creating account...';

  try {
    await signUp(email.value.trim(), password.value, name.value.trim());
    showToast('Account created! Check your email to confirm 📧', 'success');
    navigate('login');
  } catch (err) {
    showToast(err.message || 'Sign up failed', 'error');
    btn.classList.remove('loading');
    btn.innerHTML = 'Create Account ✨';
  }
}

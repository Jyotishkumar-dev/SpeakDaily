/* ============================================
   SpeakDaily — Main Application Controller
   ============================================ */

// ─── Supabase Client ───
const SUPABASE_URL = 'https://jpbgvropizffgdffwgvt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RZqdWfJMc2Ohb24XKGDfnA_d91usQ9v';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── App State ───
const AppState = {
  user: null,
  session: null,
  currentPage: 'landing',
  loading: true,
};

// ─── DOM Refs ───
const $navLinks  = document.getElementById('navLinks');
const $navUser   = document.getElementById('navUser');
const $main      = document.getElementById('appMain');
const $footer    = document.getElementById('appFooter');
const $mobileToggle = document.getElementById('mobileToggle');

// Public pages (no auth required)
const PUBLIC_PAGES = ['landing', 'login', 'signup'];
// Pages requiring auth
const AUTH_PAGES   = ['dashboard', 'practice', 'history', 'profile'];

// ─── Router ───
function getHashRoute() {
  const hash = window.location.hash.replace('#', '') || 'landing';
  return hash;
}

function navigate(page) {
  window.location.hash = '#' + page;
}

function handleRoute() {
  const page = getHashRoute();

  // Auth guard
  if (AUTH_PAGES.includes(page) && !AppState.user) {
    navigate('login');
    return;
  }

  // Already logged in → redirect away from auth pages
  if (['login', 'signup', 'landing'].includes(page) && AppState.user) {
    navigate('dashboard');
    return;
  }

  showPage(page);
}

function showPage(page) {
  AppState.currentPage = page;

  // Hide all sections
  document.querySelectorAll('.page-section').forEach(s => {
    s.classList.remove('active');
  });

  const target = document.getElementById('page-' + page);
  if (target) {
    target.classList.add('active');
    // Re-trigger enter animation
    const inner = target.querySelector('.page-enter');
    if (inner) {
      inner.style.animation = 'none';
      requestAnimationFrame(() => { inner.style.animation = ''; });
    }
  }

  // Render page content
  switch (page) {
    case 'login':    renderLoginPage();    break;
    case 'signup':   renderSignupPage();   break;
    case 'dashboard': renderDashboard();   break;
    case 'practice': renderPractice();     break;
    case 'history':  renderHistory();      break;
    case 'profile':  renderProfile();      break;
  }

  updateNav();

  // Close mobile menu
  $navLinks.classList.remove('open');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Navigation ───
function updateNav() {
  if (AppState.user) {
    const name = AppState.user.user_metadata?.full_name || AppState.user.email?.split('@')[0] || 'User';
    const initial = name.charAt(0).toUpperCase();

    $navLinks.innerHTML = `
      <a href="#dashboard" class="${AppState.currentPage === 'dashboard' ? 'active' : ''}">Dashboard</a>
      <a href="#practice" class="${AppState.currentPage === 'practice' ? 'active' : ''}">Practice</a>
      <a href="#history" class="${AppState.currentPage === 'history' ? 'active' : ''}">History</a>
      <a href="#profile" class="${AppState.currentPage === 'profile' ? 'active' : ''}">Profile</a>
    `;

    $navUser.innerHTML = `
      <div class="nav-avatar" title="${name}">${initial}</div>
      <button class="btn btn-ghost btn-sm" id="logoutBtn">Logout</button>
    `;

    document.getElementById('logoutBtn')?.addEventListener('click', handleSignOut);
  } else {
    $navLinks.innerHTML = '';
    $navUser.innerHTML = `
      <a href="#login" class="btn btn-ghost btn-sm">Sign In</a>
      <a href="#signup" class="btn btn-primary btn-sm">Get Started</a>
    `;
  }
}

// ─── Mobile Menu Toggle ───
$mobileToggle.addEventListener('click', () => {
  $navLinks.classList.toggle('open');
});

// ─── Toast Notification System ───
const $toastContainer = document.getElementById('toastContainer');

function showToast(message, type = 'info', duration = 4000) {
  const emojis = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type} toast-enter`;
  toast.innerHTML = `
    <span class="toast-emoji">${emojis[type] || '💬'}</span>
    <span>${message}</span>
    <span class="toast-close">&times;</span>
  `;

  $toastContainer.appendChild(toast);

  const close = () => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', close);
  setTimeout(close, duration);
}

// ─── Confetti Effect ───
function showConfetti() {
  const colors = ['#6C63FF', '#FF6584', '#00B894', '#FDCB6E', '#e17055', '#8b7fff'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 1.5) + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    piece.style.width = (6 + Math.random() * 8) + 'px';
    piece.style.height = (6 + Math.random() * 8) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 4000);
  }
}

// ─── Utility: Relative Time ───
function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60)    return 'just now';
  if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Utility: Format Date ───
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

// ─── Utility: Score color class ───
function scoreClass(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

// ─── Utility: Score color hex ───
function scoreColor(score) {
  if (score >= 75) return '#00B894';
  if (score >= 50) return '#FDCB6E';
  return '#e17055';
}

// ─── Skeleton Loading Helpers ───
function skeletonCard(count = 1) {
  return Array(count).fill(`
    <div class="glass-card skeleton-card skeleton" style="height:140px;"></div>
  `).join('');
}

function skeletonLines(count = 3) {
  const widths = ['long', 'medium', 'short'];
  return Array(count).fill(0).map((_, i) =>
    `<div class="skeleton skeleton-text ${widths[i % 3]}"></div>`
  ).join('');
}

// ─── Auth State Listener ───
supabase.auth.onAuthStateChange((event, session) => {
  AppState.session = session;
  AppState.user = session?.user || null;
  AppState.loading = false;

  handleRoute();
});

// ─── Init ───
async function initApp() {
  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();
  AppState.session = session;
  AppState.user = session?.user || null;
  AppState.loading = false;

  handleRoute();
}

// Listen for hash changes
window.addEventListener('hashchange', handleRoute);

// Start
initApp();


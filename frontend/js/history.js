/* ============================================
   SpeakDaily — History Module
   ============================================ */

let cachedSessions = [];
let currentFilterRange = 'all'; // 'all', '7days', '30days'

// ─── Fetch All Sessions ───
async function fetchSessions() {
  if (!AppState.user) return [];

  try {
    const { data, error } = await supabase
      .from('practice_sessions')
      .select(`
        id,
        duration_seconds,
        transcript,
        created_at,
        daily_topics (
          id,
          title,
          category,
          difficulty
        ),
        ai_feedback (
          id,
          overall_score,
          grammar_score,
          fluency_score,
          pronunciation_score,
          corrections,
          suggestions,
          encouraging_message
        )
      `)
      .eq('user_id', AppState.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    cachedSessions = data || [];
    return cachedSessions;
  } catch (err) {
    console.error('fetchSessions error:', err);
    return [];
  }
}

// ─── Render History Page ───
async function renderHistory() {
  const container = document.getElementById('historyContent');
  if (!container) return;

  // Loading skeleton
  container.innerHTML = `
    <div class="greeting-section">
      <h2>📜 Practice History</h2>
      <p class="text-muted">Track your progress and review previous speaking evaluations.</p>
    </div>
    <div class="glass-card skeleton-card skeleton mb-3"></div>
    <div class="session-grid">
      <div class="glass-card skeleton-card skeleton"></div>
      <div class="glass-card skeleton-card skeleton"></div>
      <div class="glass-card skeleton-card skeleton"></div>
    </div>
  `;

  const sessions = await fetchSessions();

  container.innerHTML = `
    <div class="section-header fade-in-up">
      <div>
        <h2>📜 Practice History</h2>
        <p class="text-muted">Review previous evaluations, examine corrections, and see your progress.</p>
      </div>
      <div>
        <a href="#practice" class="btn btn-primary btn-sm">+ New Practice</a>
      </div>
    </div>

    <!-- Score Trend Chart Section -->
    <div class="trend-section fade-in-up" id="trendSection">
      ${renderTrendChart(sessions)}
    </div>

    <!-- Filters Bar -->
    <div class="history-filters fade-in-up">
      <select id="historyRangeFilter" class="form-input">
        <option value="all" ${currentFilterRange === 'all' ? 'selected' : ''}>All Time</option>
        <option value="7days" ${currentFilterRange === '7days' ? 'selected' : ''}>Last 7 Days</option>
        <option value="30days" ${currentFilterRange === '30days' ? 'selected' : ''}>Last 30 Days</option>
      </select>
      <input type="text" id="historySearchInput" class="form-input" placeholder="🔍 Search topic or keyword...">
    </div>

    <!-- Session Grid -->
    <div class="session-grid fade-in-up" id="sessionGridList">
      ${renderSessionCards(filterSessions(sessions, currentFilterRange, ''))}
    </div>
  `;

  setupHistoryListeners();
}

// ─── Filter Sessions Helper ───
function filterSessions(sessions, range, searchKeyword) {
  const now = new Date();
  let filtered = [...sessions];

  if (range === '7days') {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(s => new Date(s.created_at) >= cutoff);
  } else if (range === '30days') {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(s => new Date(s.created_at) >= cutoff);
  }

  if (searchKeyword && searchKeyword.trim()) {
    const q = searchKeyword.toLowerCase().trim();
    filtered = filtered.filter(s => {
      const title = s.daily_topics?.title?.toLowerCase() || '';
      const cat = s.daily_topics?.category?.toLowerCase() || '';
      const transcript = s.transcript?.toLowerCase() || '';
      return title.includes(q) || cat.includes(q) || transcript.includes(q);
    });
  }

  return filtered;
}

// ─── Setup Event Listeners ───
function setupHistoryListeners() {
  const rangeSelect = document.getElementById('historyRangeFilter');
  const searchInput = document.getElementById('historySearchInput');

  if (rangeSelect) {
    rangeSelect.addEventListener('change', (e) => {
      currentFilterRange = e.target.value;
      updateFilteredView();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      updateFilteredView();
    });
  }
}

function updateFilteredView() {
  const range = document.getElementById('historyRangeFilter')?.value || 'all';
  const keyword = document.getElementById('historySearchInput')?.value || '';
  const filtered = filterSessions(cachedSessions, range, keyword);

  const grid = document.getElementById('sessionGridList');
  if (grid) {
    grid.innerHTML = renderSessionCards(filtered);
  }
}

// ─── Render Trend Chart ───
function renderTrendChart(sessions) {
  if (!sessions || sessions.length === 0) {
    return '';
  }

  // Reverse chronological up to 10 latest
  const recent = [...sessions].reverse().slice(-10);

  const bars = recent.map((s, idx) => {
    const feedback = Array.isArray(s.ai_feedback) ? s.ai_feedback[0] : s.ai_feedback;
    const score = feedback?.overall_score || 50;
    const barHeightPercent = Math.max(15, score);
    const dateLabel = new Date(s.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });

    return `
      <div class="trend-bar" style="height: ${barHeightPercent}%;" title="${score}% on ${dateLabel}">
        <span class="trend-label">${dateLabel}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="glass-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="font-size:14px; color:var(--color-dark);">📈 Performance Score Trend (Recent Sessions)</h3>
        <span class="text-muted" style="font-size:12px;">Scale: 0-100%</span>
      </div>
      <div class="trend-chart">
        ${bars}
      </div>
    </div>
  `;
}

// ─── Render Session Cards ───
function renderSessionCards(sessions) {
  if (!sessions || sessions.length === 0) {
    return `
      <div class="empty-state glass-card" style="grid-column: 1 / -1;">
        <span class="emoji">📭</span>
        <h3>No practice sessions found</h3>
        <p>No records match your selected filters. Complete more sessions to fill your library!</p>
        <a href="#practice" class="btn btn-primary btn-sm">Start Practice Session</a>
      </div>
    `;
  }

  return sessions.map((session, index) => {
    const feedback = Array.isArray(session.ai_feedback) ? session.ai_feedback[0] : session.ai_feedback;
    const overallScore = feedback?.overall_score ?? '--';
    const grammarScore = feedback?.grammar_score ?? '--';
    const fluencyScore = feedback?.fluency_score ?? '--';
    const pronScore = feedback?.pronunciation_score ?? '--';
    const topicTitle = session.daily_topics?.title || 'Daily Practice Session';
    const category = session.daily_topics?.category || 'General';
    const durationMin = Math.max(1, Math.round((session.duration_seconds || 60) / 60));
    const cardId = `session-card-${session.id || index}`;

    // Corrections preview
    let correctionsSection = '';
    const corrections = feedback?.corrections;
    if (corrections && Array.isArray(corrections) && corrections.length > 0) {
      correctionsSection = `
        <div style="margin-top:12px;">
          <strong style="font-size:13px; color:var(--color-dark);">Corrections noted:</strong>
          <div class="corrections-list" style="margin-top:8px;">
            ${corrections.map(c => `
              <div class="correction-item" style="padding:10px 14px;">
                <span class="wrong">${escapeHtml(c.wrong)}</span>
                <span class="correction-arrow">➔</span>
                <span class="correct">${escapeHtml(c.correct)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="glass-card session-card" onclick="toggleSessionDetails('${cardId}')">
        <div class="session-header">
          <h4>${escapeHtml(topicTitle)}</h4>
          <span class="session-date">${formatDate(session.created_at)}</span>
        </div>

        <p class="text-muted" style="font-size:13px; margin-bottom:12px;">
          🏷️ ${escapeHtml(category)} • ⏱️ ${durationMin} min duration
        </p>

        <div class="session-scores">
          <div class="mini-score">
            <span class="dot" style="background:${scoreColor(overallScore)}"></span>
            <strong>Overall:</strong> ${overallScore}%
          </div>
          <div class="mini-score">
            <span class="dot" style="background:${scoreColor(grammarScore)}"></span>
            <strong>Grammar:</strong> ${grammarScore}%
          </div>
          <div class="mini-score">
            <span class="dot" style="background:${scoreColor(fluencyScore)}"></span>
            <strong>Fluency:</strong> ${fluencyScore}%
          </div>
        </div>

        <!-- Expandable Details -->
        <div class="session-details" id="${cardId}">
          <div style="margin-bottom:12px;">
            <strong style="font-size:13px; color:var(--color-dark);">Your Transcript:</strong>
            <p style="font-size:13px; color:var(--color-dark-light); font-style:italic; margin-top:4px; background:rgba(108,99,255,0.04); padding:10px; border-radius:var(--radius-sm);">
              "${escapeHtml(session.transcript || 'No transcript recorded')}"
            </p>
          </div>

          ${feedback?.encouraging_message ? `
            <div class="encouraging-msg" style="padding:10px 14px; font-size:13px; margin-bottom:12px;">
              <span class="emoji">💬</span>
              <div>${escapeHtml(feedback.encouraging_message)}</div>
            </div>
          ` : ''}

          ${correctionsSection}
        </div>

        <div style="text-align:right; margin-top:12px; font-size:12px; color:var(--color-primary); font-weight:600;">
          Tap to view details ↕️
        </div>
      </div>
    `;
  }).join('');
}

// ─── Toggle Session Details Expand/Collapse ───
window.toggleSessionDetails = function(cardId) {
  const el = document.getElementById(cardId);
  if (el) {
    el.classList.toggle('expanded');
  }
};


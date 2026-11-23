/* ============================================
   SpeakDaily — History & Analytics Module
   ============================================ */

let cachedSessions = [];
let currentFilterRange = 'all'; // 'all', '7days', '30days'
let currentScoreFilter = 'all'; // 'all', 'high', 'medium', 'low'
let currentSearchQuery = '';

// ─── Fetch All Sessions ───
async function fetchSessions() {
  if (!AppState.user) {
    try {
      const raw = localStorage.getItem('speakdaily_guest_sessions');
      if (raw) {
        const parsed = JSON.parse(raw);
        cachedSessions = parsed.map(g => ({
          id: g.id,
          created_at: g.created_at,
          duration_seconds: g.duration_seconds,
          transcript: g.transcript,
          topic_title: g.topic_title,
          topic_category: g.topic_category,
          daily_topics: { title: g.topic_title, category: g.topic_category },
          ai_feedback: g.feedback
        }));
        return cachedSessions;
      }
    } catch (e) {
      console.warn('Guest history read error:', e);
    }
    return [];
  }

  try {
    let { data, error } = await supabase
      .from('practice_sessions')
      .select(`
        *,
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

    if (error) {
      console.warn('History query with relation failed, falling back to simple select:', error);
      const fallback = await supabase
        .from('practice_sessions')
        .select('*')
        .eq('user_id', AppState.user.id)
        .order('created_at', { ascending: false });
      data = fallback.data || [];
    }
    cachedSessions = data || [];
    return cachedSessions;
  } catch (err) {
    console.error('fetchSessions error:', err);
    return [];
  }
}

// ─── Analytics Summary ───
function renderAnalyticsSummary(sessions) {
  if (!sessions || sessions.length === 0) return '';

  const totalSessions = sessions.length;
  const scores = sessions
    .map(s => {
      const fb = Array.isArray(s.ai_feedback) ? s.ai_feedback[0] : s.ai_feedback;
      return fb?.overall_score;
    })
    .filter(sc => typeof sc === 'number' && !isNaN(sc));

  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration_seconds || 45), 0);
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));

  return `
    <div class="history-stats-grid fade-in-up">
      <div class="glass-card history-stat-card">
        <div class="h-stat-val">${totalSessions}</div>
        <div class="h-stat-lbl">🎙️ Sessions Logged</div>
      </div>
      <div class="glass-card history-stat-card">
        <div class="h-stat-val" style="color: ${scoreColor(avgScore)};">${avgScore > 0 ? avgScore + '%' : '--'}</div>
        <div class="h-stat-lbl">🎯 Average Score</div>
      </div>
      <div class="glass-card history-stat-card">
        <div class="h-stat-val" style="color: #00B894;">${bestScore > 0 ? bestScore + '%' : '--'}</div>
        <div class="h-stat-lbl">🏆 Peak Fluency</div>
      </div>
      <div class="glass-card history-stat-card">
        <div class="h-stat-val" style="color: var(--color-primary);">${totalMinutes} min</div>
        <div class="h-stat-lbl">⏱️ Total Spoken</div>
      </div>
    </div>
  `;
}

// ─── Render Enhanced Trend Chart ───
function renderTrendChart(sessions) {
  if (!sessions || sessions.length === 0) {
    return '';
  }

  // Display up to 12 most recent sessions in chronological sequence (oldest to newest)
  const recent = [...sessions].reverse().slice(-12);

  const barsHtml = recent.map((s, idx) => {
    const feedback = Array.isArray(s.ai_feedback) ? s.ai_feedback[0] : s.ai_feedback;
    const score = feedback?.overall_score || 50;
    const barHeightPercent = Math.max(16, Math.min(100, score));
    const dateObj = new Date(s.created_at);
    const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    const topicTitle = s.topic_title || s.daily_topics?.title || 'Practice';

    let barGradient = 'linear-gradient(to top, #00B894, #55efc4)';
    if (score < 50) {
      barGradient = 'linear-gradient(to top, #e17055, #fab1a0)';
    } else if (score < 75) {
      barGradient = 'linear-gradient(to top, #fdcb6e, #ffeaa7)';
    }

    return `
      <div class="trend-bar-col">
        <span class="bar-score-tooltip">${score}%</span>
        <div class="trend-bar-fill" style="height: ${barHeightPercent}%; background: ${barGradient};" title="${score}%: ${escapeHtml(topicTitle)} on ${dateLabel}"></div>
        <span class="bar-date-label">${dateLabel}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="glass-card trend-card-wrapper fade-in-up">
      <div class="trend-chart-header">
        <div>
          <h3 style="font-size: 15px; margin: 0; color: var(--color-dark);">📈 Fluency Performance Trend</h3>
          <span class="text-muted" style="font-size: 12px;">Overall composite scores across recent practice sessions</span>
        </div>
        <div class="trend-chart-legend">
          <div class="trend-legend-item">
            <span class="legend-dot" style="background:#00B894;"></span>
            <span>75%+ Strong</span>
          </div>
          <div class="trend-legend-item">
            <span class="legend-dot" style="background:#fdcb6e;"></span>
            <span>50-74% Good</span>
          </div>
          <div class="trend-legend-item">
            <span class="legend-dot" style="background:#e17055;"></span>
            <span>&lt;50% Growing</span>
          </div>
        </div>
      </div>
      <div class="trend-chart-body">
        ${barsHtml}
      </div>
    </div>
  `;
}

// ─── Filter Sessions Helper ───
function filterSessions(sessions, range, scoreTier, searchKeyword) {
  const now = new Date();
  let filtered = [...sessions];

  // 1. Date Range Filter
  if (range === '7days') {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(s => new Date(s.created_at) >= cutoff);
  } else if (range === '30days') {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(s => new Date(s.created_at) >= cutoff);
  }

  // 2. Score Tier Filter
  if (scoreTier === 'high') {
    filtered = filtered.filter(s => {
      const fb = Array.isArray(s.ai_feedback) ? s.ai_feedback[0] : s.ai_feedback;
      return (fb?.overall_score || 0) >= 75;
    });
  } else if (scoreTier === 'medium') {
    filtered = filtered.filter(s => {
      const fb = Array.isArray(s.ai_feedback) ? s.ai_feedback[0] : s.ai_feedback;
      const sc = fb?.overall_score || 0;
      return sc >= 50 && sc < 75;
    });
  } else if (scoreTier === 'low') {
    filtered = filtered.filter(s => {
      const fb = Array.isArray(s.ai_feedback) ? s.ai_feedback[0] : s.ai_feedback;
      return (fb?.overall_score || 0) < 50;
    });
  }

  // 3. Search Keyword Filter
  if (searchKeyword && searchKeyword.trim()) {
    const q = searchKeyword.toLowerCase().trim();
    filtered = filtered.filter(s => {
      const title = (s.topic_title || s.daily_topics?.title || '').toLowerCase();
      const cat = (s.topic_category || s.daily_topics?.category || '').toLowerCase();
      const transcript = (s.transcript || '').toLowerCase();
      return title.includes(q) || cat.includes(q) || transcript.includes(q);
    });
  }

  return filtered;
}

// ─── Render Session Cards ───
function renderSessionCards(sessions) {
  if (!sessions || sessions.length === 0) {
    return `
      <div class="empty-state glass-card" style="grid-column: 1 / -1;">
        <span class="emoji">📭</span>
        <h3>No practice sessions match your filters</h3>
        <p>Try clearing search keywords or selecting "All Time" to view your historical evaluations.</p>
        <button class="btn btn-outline btn-sm" onclick="resetHistoryFilters()">Reset Filters</button>
      </div>
    `;
  }

  return sessions.map((session, index) => {
    const feedback = Array.isArray(session.ai_feedback) ? session.ai_feedback[0] : session.ai_feedback;
    const overallScore = feedback?.overall_score ?? '--';
    const grammarScore = feedback?.grammar_score ?? '--';
    const fluencyScore = feedback?.fluency_score ?? '--';
    const pronScore = feedback?.pronunciation_score ?? '--';
    const topicTitle = session.topic_title || session.daily_topics?.title || 'Daily Practice Session';
    const category = session.topic_category || session.daily_topics?.category || 'General';
    const durationMin = Math.max(1, Math.round((session.duration_seconds || 45) / 60));
    const cardId = `session-card-${session.id || index}`;
    const wordCount = (session.transcript || '').trim().split(/\s+/).filter(Boolean).length;

    // Corrections preview
    let correctionsSection = '';
    const corrections = feedback?.corrections;
    if (corrections && Array.isArray(corrections) && corrections.length > 0) {
      correctionsSection = `
        <div style="margin-top:14px;">
          <strong style="font-size:13px; color:var(--color-dark); display:block; margin-bottom:8px;">
            🔍 Indianisms &amp; Grammar Corrections (${corrections.length}):
          </strong>
          <div class="corrections-list">
            ${corrections.map(c => `
              <div class="correction-item" style="padding:10px 14px; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <span class="wrong">${escapeHtml(c.wrong || c.find)}</span>
                  <span class="correction-arrow">➔</span>
                  <span class="correct">${escapeHtml(c.correct || c.replace)}</span>
                </div>
                ${c.explanation ? `<div style="font-size:11px; color:var(--color-dark-light); margin-top:4px;">💡 ${escapeHtml(c.explanation)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Suggestions list
    let suggestionsSection = '';
    if (feedback?.suggestions && Array.isArray(feedback.suggestions) && feedback.suggestions.length > 0) {
      suggestionsSection = `
        <div style="margin-top:14px;">
          <strong style="font-size:13px; color:var(--color-dark); display:block; margin-bottom:6px;">
            💡 Key Recommendations for Improvement:
          </strong>
          <ul style="margin:0; padding-left:20px; font-size:12px; color:var(--color-dark-light); line-height:1.5;">
            ${feedback.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    return `
      <div class="glass-card session-card" onclick="toggleSessionDetails('${cardId}')">
        <div class="session-header">
          <h4>${escapeHtml(topicTitle)}</h4>
          <span class="session-date">${formatDate(session.created_at)}</span>
        </div>

        <p class="text-muted" style="font-size:12px; margin-bottom:12px;">
          🏷️ ${escapeHtml(category)} • ⏱️ ${durationMin} min duration • 📝 ${wordCount} words
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
          <div class="mini-score">
            <span class="dot" style="background:${scoreColor(pronScore)}"></span>
            <strong>Clarity:</strong> ${pronScore}%
          </div>
        </div>

        <!-- Expandable Details -->
        <div class="session-details" id="${cardId}" onclick="event.stopPropagation()">
          <div class="transcript-box">
            <div class="transcript-box-header">
              <strong style="font-size:12px; color:var(--color-dark);">🎙️ Speech Transcript (${wordCount} words):</strong>
              <button class="transcript-copy-btn" onclick="copyTranscript('${cardId}')" title="Copy transcript to clipboard">
                📋 Copy
              </button>
            </div>
            <p id="${cardId}-transcript-text" style="font-size:13px; color:var(--color-dark-light); font-style:italic; margin:0; line-height:1.5;">
              "${escapeHtml(session.transcript || 'No transcript recorded')}"
            </p>
          </div>

          ${feedback?.encouraging_message ? `
            <div class="encouraging-msg" style="padding:10px 14px; font-size:13px; margin: 10px 0;">
              <span class="emoji">💬</span>
              <div>${escapeHtml(feedback.encouraging_message)}</div>
            </div>
          ` : ''}

          ${correctionsSection}
          ${suggestionsSection}

          <!-- Action Buttons Bar -->
          <div class="session-card-actions">
            <button class="btn btn-primary btn-sm" onclick="practiceAgainWithTopic('${escapeHtml(topicTitle)}', '${escapeHtml(category)}')">
              🔄 Practice Again
            </button>
            <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="deleteSessionRecord('${session.id}')">
              🗑️ Delete
            </button>
          </div>
        </div>

        <div style="text-align:right; margin-top:12px; font-size:12px; color:var(--color-primary); font-weight:600;">
          Tap to review full transcript &amp; corrections ↕️
        </div>
      </div>
    `;
  }).join('');
}

// ─── Setup Event Listeners ───
function setupHistoryListeners() {
  const rangeSelect = document.getElementById('historyRangeFilter');
  const scoreSelect = document.getElementById('historyScoreFilter');
  const searchInput = document.getElementById('historySearchInput');

  rangeSelect?.addEventListener('change', (e) => {
    currentFilterRange = e.target.value;
    updateFilteredView();
  });

  scoreSelect?.addEventListener('change', (e) => {
    currentScoreFilter = e.target.value;
    updateFilteredView();
  });

  searchInput?.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    updateFilteredView();
  });
}

function updateFilteredView() {
  const filtered = filterSessions(cachedSessions, currentFilterRange, currentScoreFilter, currentSearchQuery);

  const grid = document.getElementById('sessionGridList');
  if (grid) {
    grid.innerHTML = renderSessionCards(filtered);
  }

  const badge = document.getElementById('historyCountBadge');
  if (badge) {
    badge.textContent = `Showing ${filtered.length} of ${cachedSessions.length} sessions`;
  }
}

// ─── Reset Filters ───
window.resetHistoryFilters = function () {
  currentFilterRange = 'all';
  currentScoreFilter = 'all';
  currentSearchQuery = '';

  const rangeSelect = document.getElementById('historyRangeFilter');
  const scoreSelect = document.getElementById('historyScoreFilter');
  const searchInput = document.getElementById('historySearchInput');

  if (rangeSelect) rangeSelect.value = 'all';
  if (scoreSelect) scoreSelect.value = 'all';
  if (searchInput) searchInput.value = '';

  updateFilteredView();
};

// ─── Copy Transcript Helper ───
window.copyTranscript = function (cardId) {
  const textEl = document.getElementById(`${cardId}-transcript-text`);
  if (!textEl) return;

  const rawText = textEl.innerText.replace(/^"|"$/g, '');
  navigator.clipboard.writeText(rawText).then(() => {
    showToast('Transcript copied to clipboard! 📋', 'success', 2500);
  }).catch(() => {
    showToast('Failed to copy transcript', 'error');
  });
};

// ─── Practice Again With This Topic ───
window.practiceAgainWithTopic = function (title, category) {
  const customTopic = {
    id: 'topic-replay-' + Date.now(),
    title: title,
    category: category || 'Conversation',
    difficulty: 'intermediate',
    description: `Repeat practice session on "${title}". Focus on pacing and avoiding previous grammar errors.`,
    prompt_questions: [
      'Speak about key points with clear pronunciation.',
      'Maintain continuous flow with natural breathing.'
    ]
  };

  if (window.setActivePracticeTopic) {
    window.setActivePracticeTopic(customTopic);
  }
  navigate('practice');
};

// ─── Delete Practice Session ───
window.deleteSessionRecord = async function (sessionId) {
  if (!confirm('Are you sure you want to delete this practice session record?')) {
    return;
  }

  if (!AppState.user) {
    // Delete from localStorage guest sessions
    try {
      const raw = localStorage.getItem('speakdaily_guest_sessions');
      if (raw) {
        let guestSessions = JSON.parse(raw);
        guestSessions = guestSessions.filter(s => s.id !== sessionId);
        localStorage.setItem('speakdaily_guest_sessions', JSON.stringify(guestSessions));
      }
      cachedSessions = cachedSessions.filter(s => s.id !== sessionId);
      showToast('Practice session deleted from local device', 'info');
      updateFilteredView();
      renderHistory();
    } catch (e) {
      console.warn('Guest session deletion error:', e);
    }
    return;
  }

  try {
    const { error } = await supabase
      .from('practice_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', AppState.user.id);

    if (error) throw error;

    cachedSessions = cachedSessions.filter(s => s.id !== sessionId);
    showToast('Practice session deleted successfully 🗑️', 'success');
    updateFilteredView();
    renderHistory();
  } catch (err) {
    console.error('Delete session error:', err);
    showToast('Failed to delete session: ' + (err.message || 'Error'), 'error');
  }
};

// ─── Export History to JSON ───
window.exportHistoryData = function () {
  if (!cachedSessions || cachedSessions.length === 0) {
    showToast('No sessions available to export', 'warning');
    return;
  }

  const exportPayload = cachedSessions.map(s => {
    const fb = Array.isArray(s.ai_feedback) ? s.ai_feedback[0] : s.ai_feedback;
    return {
      id: s.id,
      date: s.created_at,
      topic: s.topic_title || s.daily_topics?.title || 'Daily Practice',
      category: s.topic_category || s.daily_topics?.category || 'General',
      duration_seconds: s.duration_seconds || 45,
      transcript: s.transcript,
      overall_score: fb?.overall_score || 0,
      grammar_score: fb?.grammar_score || 0,
      fluency_score: fb?.fluency_score || 0,
      pronunciation_score: fb?.pronunciation_score || 0,
      corrections: fb?.corrections || [],
      suggestions: fb?.suggestions || []
    };
  });

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `speakdaily-history-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('Practice history exported to JSON! 📥', 'success');
};

// ─── Toggle Session Details Expand/Collapse ───
window.toggleSessionDetails = function (cardId) {
  const el = document.getElementById(cardId);
  if (el) {
    el.classList.toggle('expanded');
  }
};

// ─── Render Main History Page ───
async function renderHistory() {
  const container = document.getElementById('historyContent');
  if (!container) return;

  // Loading skeleton
  container.innerHTML = `
    <div class="greeting-section">
      <h2>📜 Practice History</h2>
      <p class="text-muted">Track your progress and review previous speaking evaluations.</p>
    </div>
    <div class="glass-card skeleton-card skeleton mb-3" style="height:140px;"></div>
    <div class="session-grid">
      <div class="glass-card skeleton-card skeleton" style="height:180px;"></div>
      <div class="glass-card skeleton-card skeleton" style="height:180px;"></div>
      <div class="glass-card skeleton-card skeleton" style="height:180px;"></div>
    </div>
  `;

  const sessions = await fetchSessions();

  const guestHistoryNotice = !AppState.user ? `
    <div class="guest-sync-banner fade-in-up mb-3">
      <div class="banner-icon">📱</div>
      <div>
        <strong>Guest Device History</strong>: Showing practice sessions recorded locally on this browser. To permanently sync your history to the cloud, <a href="#signup">create a free account</a>.
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    ${guestHistoryNotice}

    <div class="section-header fade-in-up">
      <div>
        <h2>📜 Practice History &amp; Analytics</h2>
        <p class="text-muted">Track speaking consistency, examine detailed AI corrections, and measure fluency improvement.</p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-outline btn-sm" onclick="exportHistoryData()" title="Download JSON export of your sessions">
          📥 Export
        </button>
        <a href="#practice" class="btn btn-primary btn-sm">+ New Practice</a>
      </div>
    </div>

    <!-- Analytics Summary 4-Cards Grid -->
    ${renderAnalyticsSummary(sessions)}

    <!-- Score Trend Chart Section -->
    <div class="trend-section fade-in-up" id="trendSection">
      ${renderTrendChart(sessions)}
    </div>

    <!-- Multi-Filter Bar -->
    <div class="history-filters-bar fade-in-up">
      <div class="history-search-wrap">
        <span class="history-search-icon">🔍</span>
        <input type="text" id="historySearchInput" class="form-input history-search-input" placeholder="Search topic or transcript keyword..." value="${escapeHtml(currentSearchQuery)}">
      </div>

      <select id="historyRangeFilter" class="form-input">
        <option value="all" ${currentFilterRange === 'all' ? 'selected' : ''}>📅 All Time</option>
        <option value="7days" ${currentFilterRange === '7days' ? 'selected' : ''}>Last 7 Days</option>
        <option value="30days" ${currentFilterRange === '30days' ? 'selected' : ''}>Last 30 Days</option>
      </select>

      <select id="historyScoreFilter" class="form-input">
        <option value="all" ${currentScoreFilter === 'all' ? 'selected' : ''}>🎯 All Scores</option>
        <option value="high" ${currentScoreFilter === 'high' ? 'selected' : ''}>🌟 Strong (75%+)</option>
        <option value="medium" ${currentScoreFilter === 'medium' ? 'selected' : ''}>📈 Good (50-74%)</option>
        <option value="low" ${currentScoreFilter === 'low' ? 'selected' : ''}>🌱 Growing (&lt;50%)</option>
      </select>

      <div class="history-count-badge" id="historyCountBadge">
        Showing ${sessions.length} of ${sessions.length} sessions
      </div>
    </div>

    <!-- Session Grid -->
    <div class="session-grid fade-in-up" id="sessionGridList">
      ${renderSessionCards(filterSessions(sessions, currentFilterRange, currentScoreFilter, currentSearchQuery))}
    </div>
  `;

  setupHistoryListeners();
}

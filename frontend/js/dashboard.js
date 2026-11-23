/* ============================================
   SpeakDaily — Dashboard Module
   ============================================ */

// Motivational quotes rotation
const MOTIVATIONAL_QUOTES = [
  { quote: "Do not be afraid of mistakes. An error does not become a mistake until you refuse to correct it.", author: "O.A. Battista" },
  { quote: "Language is the road map of a culture. It tells you where its people come from and where they are going.", author: "Rita Mae Brown" },
  { quote: "One language sets you in a corridor for life. Two languages open every door along the way.", author: "Frank Smith" },
  { quote: "The limits of my language mean the limits of my world.", author: "Ludwig Wittgenstein" },
  { quote: "Fluency is not about speaking without hesitation, but about communicating with confidence.", author: "SpeakDaily Team" },
  { quote: "A little daily practice is better than hours once a week. Keep that streak alive!", author: "SpeakDaily Wisdom" },
  { quote: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { quote: "Continuous effort—not strength or intelligence—is the key to unlocking our potential.", author: "Winston Churchill" },
  { quote: "Speak with your heart and clarity will naturally follow.", author: "Communication Master" },
  { quote: "Every native speaker was once a beginner learning their very first word.", author: "Polyglot Proverb" }
];

// Active today topic cache and countdown interval
let currentTodayTopic = null;
let topicCountdownInterval = null;

// ─── Fetch Today's Topic ───
async function fetchTodayTopic() {
  try {
    const todayISO = new Date().toISOString().split('T')[0];

    // 1. Attempt exact match on today's date in Supabase
    const { data, error } = await supabase
      .from('daily_topics')
      .select('*')
      .eq('date', todayISO)
      .eq('is_active', true)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('Could not fetch exact today topic:', error);
    }

    if (data) {
      currentTodayTopic = data;
      return data;
    }

    // 2. Fallback: fetch any active topic from Supabase
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('daily_topics')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    if (!fallbackError && fallbackData && fallbackData.length > 0) {
      currentTodayTopic = fallbackData[0];
      return fallbackData[0];
    }
  } catch (err) {
    console.warn('Supabase topic fetch warning, falling back to curated pool:', err);
  }

  // 3. Fallback from curated pool
  const pool = window.PRACTICE_TOPIC_POOL || [
    {
      id: 'topic-intro',
      title: 'Introduce Yourself & Your Aspirations',
      category: 'Conversation',
      difficulty: 'beginner',
      description: 'Speak for 1-2 minutes introducing who you are, what you enjoy doing, and one big dream you want to achieve this year.',
      prompt_questions: [
        'What is your name and where are you from?',
        'What is your favorite hobby and why do you love it?',
        'What is one big personal or professional goal you want to achieve?'
      ]
    }
  ];

  currentTodayTopic = pool[0];
  return currentTodayTopic;
}

// ─── Fetch User Stats ───
async function fetchUserStats() {
  if (!AppState.user) {
    // If guest mode, calculate from localStorage
    try {
      const raw = localStorage.getItem('speakdaily_guest_sessions');
      if (raw) {
        const guestSessions = JSON.parse(raw);
        if (Array.isArray(guestSessions) && guestSessions.length > 0) {
          const scores = guestSessions.map(s => s.feedback?.overall_score).filter(Boolean);
          const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
          const mins = Math.round(guestSessions.reduce((acc, s) => acc + (s.duration_seconds || 45), 0) / 60);
          return {
            streak_count: 1,
            total_sessions: guestSessions.length,
            avg_score: avg,
            total_minutes: mins
          };
        }
      }
    } catch (e) { }

    return { streak_count: 0, total_sessions: 0, avg_score: 0, total_minutes: 0 };
  }

  // Local user mode
  if (AppState.isLocalMode || AppState.user.id.startsWith('local_')) {
    try {
      const prof = JSON.parse(localStorage.getItem('speakdaily_profile_' + AppState.user.id) || '{}');
      const sessions = JSON.parse(localStorage.getItem('speakdaily_user_sessions_' + AppState.user.id) || '[]');
      const scores = sessions
        .map(s => s.ai_feedback?.overall_score)
        .filter(score => typeof score === 'number' && !isNaN(score));
      const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const totalSecs = sessions.reduce((sum, s) => sum + (s.duration_seconds || 45), 0);
      return {
        streak_count: prof.streak_count || (sessions.length > 0 ? 1 : 0),
        total_sessions: Math.max(prof.total_sessions || 0, sessions.length),
        avg_score: avg,
        total_minutes: Math.max(1, Math.round(totalSecs / 60))
      };
    } catch (e) {
      console.warn('Local stats read error:', e);
    }
  }

  try {
    // 1. Profile stats
    const { data: profile } = await supabase
      .from('profiles')
      .select('streak_count, total_sessions')
      .eq('id', AppState.user.id)
      .maybeSingle();

    let streak = profile?.streak_count || 0;
    let totalSessions = profile?.total_sessions || 0;

    // 2. Compute avg score and duration from practice sessions
    const { data: sessions } = await supabase
      .from('practice_sessions')
      .select('id, duration_seconds, ai_feedback(overall_score)')
      .eq('user_id', AppState.user.id);

    let avgScore = 0;
    let totalSeconds = 0;

    if (sessions && sessions.length > 0) {
      totalSessions = Math.max(totalSessions, sessions.length);

      const scores = sessions
        .map(s => (Array.isArray(s.ai_feedback) ? s.ai_feedback[0]?.overall_score : s.ai_feedback?.overall_score))
        .filter(score => typeof score === 'number' && !isNaN(score));

      if (scores.length > 0) {
        avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }

      totalSeconds = sessions.reduce((sum, s) => sum + (s.duration_seconds || 45), 0);
    }

    const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));

    return {
      streak_count: streak,
      total_sessions: totalSessions,
      avg_score: avgScore,
      total_minutes: totalSessions > 0 ? totalMinutes : 0
    };
  } catch (err) {
    console.error('fetchUserStats error:', err);
    return { streak_count: 0, total_sessions: 0, avg_score: 0, total_minutes: 0 };
  }
}

// ─── Fetch Weekly Activity (Last 7 Days) ───
async function fetchWeeklyActivity() {
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  const currentDayIndex = today.getDay();

  // Build the 7 days ending today
  const weekDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    weekDays.push({
      dateStr: dateStr,
      dayName: daysOfWeek[d.getDay()],
      isToday: i === 0,
      active: false
    });
  }

  if (!AppState.user) {
    try {
      const raw = localStorage.getItem('speakdaily_guest_sessions');
      if (raw) {
        const guestSessions = JSON.parse(raw);
        const datesWithSessions = new Set(guestSessions.map(s => s.created_at?.split('T')[0]));
        weekDays.forEach(w => {
          if (datesWithSessions.has(w.dateStr)) w.active = true;
        });
      }
    } catch (e) { }
    return weekDays;
  }

  if (AppState.isLocalMode || AppState.user.id.startsWith('local_')) {
    try {
      const sessions = JSON.parse(localStorage.getItem('speakdaily_user_sessions_' + AppState.user.id) || '[]');
      const datesWithSessions = new Set(sessions.map(s => s.created_at?.split('T')[0]));
      weekDays.forEach(w => {
        if (datesWithSessions.has(w.dateStr)) w.active = true;
      });
    } catch (e) { }
    return weekDays;
  }

  try {
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sessions } = await supabase
      .from('practice_sessions')
      .select('created_at')
      .eq('user_id', AppState.user.id)
      .gte('created_at', sevenDaysAgo);

    if (sessions && sessions.length > 0) {
      const datesWithSessions = new Set(sessions.map(s => s.created_at?.split('T')[0]));
      weekDays.forEach(w => {
        if (datesWithSessions.has(w.dateStr)) w.active = true;
      });
    }
  } catch (err) {
    console.warn('Weekly activity fetch warning:', err);
  }

  return weekDays;
}

// ─── Fetch Recent Sessions ───
async function fetchRecentSessions() {
  if (!AppState.user) {
    try {
      const raw = localStorage.getItem('speakdaily_guest_sessions');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.slice(0, 5).map(g => ({
          id: g.id,
          duration_seconds: g.duration_seconds,
          created_at: g.created_at,
          topic_title: g.topic_title,
          daily_topics: { title: g.topic_title, category: g.topic_category },
          ai_feedback: g.feedback
        }));
      }
    } catch (e) { }
    return [];
  }

  if (AppState.isLocalMode || AppState.user.id.startsWith('local_')) {
    try {
      const sessions = JSON.parse(localStorage.getItem('speakdaily_user_sessions_' + AppState.user.id) || '[]');
      return sessions.slice(0, 5).map(s => ({
        id: s.id,
        duration_seconds: s.duration_seconds,
        created_at: s.created_at,
        topic_title: s.topic_title,
        daily_topics: { title: s.topic_title, category: s.topic_category },
        ai_feedback: s.ai_feedback
      }));
    } catch (e) {
      return [];
    }
  }

  try {
    const { data, error } = await supabase
      .from('practice_sessions')
      .select(`
        *,
        daily_topics (title, category),
        ai_feedback (
          overall_score,
          grammar_score,
          fluency_score,
          encouraging_message
        )
      `)
      .eq('user_id', AppState.user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      // Fallback simple query
      const fallback = await supabase
        .from('practice_sessions')
        .select('*')
        .eq('user_id', AppState.user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return fallback.data || [];
    }

    return data || [];
  } catch (err) {
    console.error('fetchRecentSessions error:', err);
    return [];
  }
}

// ─── Countdown Timer to Midnight Reset ───
function getMidnightCountdown() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diffMs = Math.max(0, midnight - now);

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function startTopicCountdown() {
  if (topicCountdownInterval) {
    clearInterval(topicCountdownInterval);
  }

  const updateCountdown = () => {
    const el = document.getElementById('topicCountdown');
    if (el) {
      el.textContent = `⏳ Resets in ${getMidnightCountdown()}`;
    }
  };

  updateCountdown();
  topicCountdownInterval = setInterval(updateCountdown, 1000);
}

// ─── Quote Rotation ───
window.rotateQuote = function () {
  const quoteEl = document.getElementById('dailyQuoteText');
  const authorEl = document.getElementById('dailyQuoteAuthor');
  if (!quoteEl || !authorEl) return;

  const quote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];

  quoteEl.style.opacity = '0';
  authorEl.style.opacity = '0';

  setTimeout(() => {
    quoteEl.textContent = `"${quote.quote}"`;
    authorEl.textContent = `— ${quote.author}`;
    quoteEl.style.opacity = '1';
    authorEl.style.opacity = '1';
  }, 200);
};

// ─── Quick Modes Trigger ───
window.startQuickMode = function (mode) {
  const pool = window.PRACTICE_TOPIC_POOL || [];

  if (mode === 'daily') {
    if (window.setActivePracticeTopic && currentTodayTopic) {
      window.setActivePracticeTopic(currentTodayTopic);
    }
  } else if (mode === 'interview') {
    const interviewTopic = pool.find(t => t.category === 'Career' || t.category === 'Workplace') || {
      id: 'topic-career',
      title: 'Discussing Your Professional Strengths',
      category: 'Career',
      difficulty: 'intermediate',
      description: 'Describe a complex challenge you solved at work or in your studies and the specific skills you utilized.',
      prompt_questions: [
        'What was the situation or problem you faced?',
        'What exact action did you take to resolve it?',
        'What was the positive outcome and what did you learn?'
      ]
    };
    if (window.setActivePracticeTopic) window.setActivePracticeTopic(interviewTopic);
  } else if (mode === 'impromptu') {
    const randomTopic = pool[Math.floor(Math.random() * pool.length)] || currentTodayTopic;
    if (window.setActivePracticeTopic) window.setActivePracticeTopic(randomTopic);
    showToast(`Surprise topic selected: "${randomTopic.title}" 🎲`, 'info', 3000);
  }

  navigate('practice');
};

// ─── Shuffle Topic Right on Dashboard ───
window.shuffleDashboardTopic = function () {
  const pool = window.PRACTICE_TOPIC_POOL || [];
  if (pool.length <= 1) return;

  const currentId = currentTodayTopic?.id;
  const poolFiltered = pool.filter(t => t.id !== currentId);
  currentTodayTopic = poolFiltered[Math.floor(Math.random() * poolFiltered.length)];

  // Update DOM elements smoothly
  const titleEl = document.getElementById('dashTopicTitle');
  const descEl = document.getElementById('dashTopicDesc');
  const catEl = document.getElementById('dashTopicCategory');
  const diffEl = document.getElementById('dashTopicDifficulty');
  const listEl = document.getElementById('dashTopicPrompts');

  if (titleEl) titleEl.textContent = currentTodayTopic.title;
  if (descEl) descEl.textContent = currentTodayTopic.description;
  if (catEl) catEl.textContent = `🏷️ ${currentTodayTopic.category || 'Conversation'}`;
  if (diffEl) diffEl.textContent = `🎯 ${currentTodayTopic.difficulty || 'All levels'}`;

  if (listEl && currentTodayTopic.prompt_questions) {
    listEl.innerHTML = currentTodayTopic.prompt_questions.map(q => `<li>${escapeHtml(q)}</li>`).join('');
  }

  showToast(`Switched topic to "${currentTodayTopic.title}" 🎯`, 'info', 2500);
};

// ─── Render Dashboard Page ───
async function renderDashboard() {
  const container = document.getElementById('dashboardContent');
  if (!container) return;

  // Initial skeleton state
  container.innerHTML = `
    <div class="greeting-section">
      <div class="skeleton skeleton-text short" style="height:28px;"></div>
      <div class="skeleton skeleton-text medium"></div>
    </div>
    <div class="glass-card skeleton-card skeleton mb-3" style="height:220px;"></div>
    <div class="stats-grid">
      <div class="glass-card skeleton-card skeleton" style="height:110px;"></div>
      <div class="glass-card skeleton-card skeleton" style="height:110px;"></div>
      <div class="glass-card skeleton-card skeleton" style="height:110px;"></div>
      <div class="glass-card skeleton-card skeleton" style="height:110px;"></div>
    </div>
  `;

  // Time-based greeting
  const hour = new Date().getHours();
  let timeGreeting = 'Good evening';
  let greetingEmoji = '🌙';
  if (hour < 12) {
    timeGreeting = 'Good morning';
    greetingEmoji = '🌅';
  } else if (hour < 18) {
    timeGreeting = 'Good afternoon';
    greetingEmoji = '☀️';
  }

  const userDisplayName = AppState.user?.user_metadata?.full_name ||
    AppState.user?.email?.split('@')[0] ||
    'Speaker';

  // Random quote
  const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];

  // Fetch data in parallel
  const [topic, stats, recentSessions, weeklyActivity] = await Promise.all([
    fetchTodayTopic(),
    fetchUserStats(),
    fetchRecentSessions(),
    fetchWeeklyActivity()
  ]);

  // Streak badge & encouraging caption
  let streakSubtitle = 'Start your streak today!';
  if (stats.streak_count >= 7) {
    streakSubtitle = '🔥 Legendary Champion!';
  } else if (stats.streak_count >= 3) {
    streakSubtitle = '⚡ Unstoppable Momentum!';
  } else if (stats.streak_count >= 1) {
    streakSubtitle = '👍 Active Daily Streak';
  }

  // Fluency Tier
  let scoreTierSubtitle = 'Complete sessions to score';
  if (stats.avg_score >= 80) {
    scoreTierSubtitle = '🌟 Fluent & Articulate';
  } else if (stats.avg_score >= 65) {
    scoreTierSubtitle = '📈 Confident Speaker';
  } else if (stats.avg_score > 0) {
    scoreTierSubtitle = '🌱 Growing Rapidly';
  }

  // Build Recent Sessions HTML
  let recentSessionsHtml = '';
  if (recentSessions.length === 0) {
    recentSessionsHtml = `
      <div class="empty-state glass-card">
        <span class="emoji">🎙️</span>
        <h3>No practice sessions yet</h3>
        <p>Complete today's 5-minute speaking session to start building your fluency history and scores!</p>
        <button class="btn btn-primary btn-sm" onclick="startPracticeTopic('${topic.id}')">
          Start Your First Session 🚀
        </button>
      </div>
    `;
  } else {
    recentSessionsHtml = `
      <div class="activity-list">
        ${recentSessions.map(session => {
          const feedback = Array.isArray(session.ai_feedback) ? session.ai_feedback[0] : session.ai_feedback;
          const score = feedback?.overall_score ?? '--';
          const scoreTier = typeof score === 'number' ? scoreClass(score) : 'medium';
          const topicTitle = session.topic_title || session.daily_topics?.title || 'Daily Speaking Practice';
          const category = session.topic_category || session.daily_topics?.category || 'General';
          const durationMin = Math.max(1, Math.round((session.duration_seconds || 45) / 60));

          return `
            <div class="activity-item">
              <div class="activity-score ${scoreTier}">
                ${score}${typeof score === 'number' ? '%' : ''}
              </div>
              <div class="activity-info">
                <h4>${escapeHtml(topicTitle)}</h4>
                <p>🏷️ ${escapeHtml(category)} • ⏱️ ${durationMin} min • ${timeAgo(session.created_at)}</p>
              </div>
              <div class="activity-date">
                <a href="#history" class="btn btn-ghost btn-sm">Review ➔</a>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Build Weekly Activity Days HTML
  const weeklyDaysHtml = weeklyActivity.map(day => `
    <div class="weekly-day-pill ${day.active ? 'active' : ''} ${day.isToday ? 'today' : ''}" title="${day.dateStr}">
      <span class="day-icon">${day.active ? '✅' : (day.isToday ? '🎯' : '⚪')}</span>
      <span>${day.dayName}</span>
    </div>
  `).join('');

  // Prompt questions list HTML
  const promptsListHtml = topic.prompt_questions && topic.prompt_questions.length > 0
    ? topic.prompt_questions.map(q => `<li>${escapeHtml(q)}</li>`).join('')
    : '<li>Introduce your perspective and explain your reasoning clearly.</li><li>Share a specific real-world example.</li>';

  container.innerHTML = `
    <!-- Top Greeting -->
    <div class="greeting-section fade-in-up">
      <h1>${greetingEmoji} ${timeGreeting}, <span class="text-primary">${escapeHtml(userDisplayName)}</span></h1>
      <p>Consistency is key to natural English fluency. Ready for today's 5-minute session?</p>
    </div>

    <!-- Daily Topic Hero Card -->
    <div class="topic-card fade-in-up">
      <div class="topic-header-row">
        <div class="topic-label">🌟 TODAY'S DAILY SPEAKING CHALLENGE</div>
        <div class="topic-countdown-badge" id="topicCountdown">
          ⏳ Resets in ${getMidnightCountdown()}
        </div>
      </div>

      <h2 id="dashTopicTitle">${escapeHtml(topic.title)}</h2>
      <p id="dashTopicDesc">${escapeHtml(topic.description)}</p>

      <div style="margin-bottom: 12px;">
        <span class="badge" id="dashTopicDifficulty" style="background: rgba(255,255,255,0.25); text-transform: capitalize;">
          🎯 ${escapeHtml(topic.difficulty || 'All levels')}
        </span>
        <span class="badge" id="dashTopicCategory" style="background: rgba(255,255,255,0.2);">
          🏷️ ${escapeHtml(topic.category || 'Conversation')}
        </span>
      </div>

      <!-- Guided Prompts Preview -->
      <div class="topic-prompts-preview">
        <div class="topic-prompts-title">
          <span>💡 Guided Points to Talk About</span>
        </div>
        <ul class="topic-prompts-list" id="dashTopicPrompts">
          ${promptsListHtml}
        </ul>
      </div>

      <!-- Action Buttons Row -->
      <div class="hero-actions-row">
        <button class="btn btn-hero-primary btn-lg" onclick="startPracticeTopic('${topic.id}')">
          🎙️ Start Today's Challenge (5 Min)
        </button>
        <button class="btn btn-hero-secondary" onclick="shuffleDashboardTopic()">
          🎲 Change Topic
        </button>
      </div>
    </div>

    <!-- 4 Stats Grid -->
    <div class="stats-grid fade-in-up">
      <div class="glass-card stat-card">
        <span class="stat-emoji">🔥</span>
        <div class="stat-value">${stats.streak_count} <span style="font-size:1rem; font-weight:600;">days</span></div>
        <div class="stat-label">Daily Streak</div>
        <div class="stat-sub">${streakSubtitle}</div>
      </div>
      <div class="glass-card stat-card">
        <span class="stat-emoji">🎙️</span>
        <div class="stat-value">${stats.total_sessions}</div>
        <div class="stat-label">Sessions Done</div>
        <div class="stat-sub">5 min each</div>
      </div>
      <div class="glass-card stat-card">
        <span class="stat-emoji">🎯</span>
        <div class="stat-value">${stats.avg_score > 0 ? stats.avg_score + '%' : '--'}</div>
        <div class="stat-label">Fluency Score</div>
        <div class="stat-sub">${scoreTierSubtitle}</div>
      </div>
      <div class="glass-card stat-card">
        <span class="stat-emoji">⏱️</span>
        <div class="stat-value">${stats.total_minutes} <span style="font-size:1rem; font-weight:600;">min</span></div>
        <div class="stat-label">Time Spoken</div>
        <div class="stat-sub">Vocal practice</div>
      </div>
    </div>

    <!-- Weekly Practice Habit Tracker -->
    <div class="glass-card weekly-tracker-card fade-in-up">
      <div class="weekly-tracker-header">
        <h3 style="font-size: 15px; margin: 0;">📅 7-Day Speaking Habit Tracker</h3>
        <span class="text-muted" style="font-size: 12px;">Goal: 5+ sessions/week</span>
      </div>
      <div class="weekly-tracker-days">
        ${weeklyDaysHtml}
      </div>
    </div>

    <!-- Quick Practice Modes -->
    <div class="fade-in-up">
      <div class="section-header">
        <h3>⚡ Quick Practice Modes</h3>
        <span class="text-muted" style="font-size:13px;">Pick a format that fits your mood</span>
      </div>
      <div class="quick-modes-grid">
        <div class="glass-card quick-mode-card" onclick="startQuickMode('daily')">
          <div>
            <div class="mode-icon">🌟</div>
            <h4>Today's Official Topic</h4>
            <p>Master today's recommended community discussion topic with AI correction.</p>
          </div>
          <div class="mode-cta">Start Challenge ➔</div>
        </div>

        <div class="glass-card quick-mode-card" onclick="startQuickMode('interview')">
          <div>
            <div class="mode-icon">💼</div>
            <h4>Workplace &amp; Interview</h4>
            <p>Practice professional workplace storytelling, STAR method, and career questions.</p>
          </div>
          <div class="mode-cta">Practice Workplace ➔</div>
        </div>

        <div class="glass-card quick-mode-card" onclick="startQuickMode('impromptu')">
          <div>
            <div class="mode-icon">🎲</div>
            <h4>Impromptu Rapid-Fire</h4>
            <p>Test your spontaneous flow and eliminate hesitation with a random topic.</p>
          </div>
          <div class="mode-cta">Try Surprise Prompt ➔</div>
        </div>
      </div>
    </div>

    <!-- Motivational Quote -->
    <div class="quote-card fade-in-up">
      <span class="emoji">💡</span>
      <blockquote>
        <span id="dailyQuoteText" style="transition: opacity 0.2s ease;">"${escapeHtml(randomQuote.quote)}"</span>
        <div id="dailyQuoteAuthor" style="margin-top:6px; font-weight:600; color:var(--color-primary); transition: opacity 0.2s ease;">— ${escapeHtml(randomQuote.author)}</div>
      </blockquote>
      <button class="quote-refresh-btn" onclick="rotateQuote()" title="Load another inspiring quote">
        🔄 New
      </button>
    </div>

    <!-- Recent Activity Section -->
    <div class="recent-activity-section fade-in-up">
      <div class="section-header">
        <h3>📝 Recent Practice Sessions</h3>
        <a href="#history" class="btn btn-ghost btn-sm">View All ➔</a>
      </div>
      ${recentSessionsHtml}
    </div>
  `;

  // Start live countdown timer to midnight
  startTopicCountdown();
}

// ─── Helper: Start Topic and Navigate ───
window.startPracticeTopic = function (topicId) {
  if (window.setActivePracticeTopic && currentTodayTopic) {
    window.setActivePracticeTopic(currentTodayTopic);
  }
  navigate('practice');
};

// ─── Simple HTML Escaper (Fallback) ───
if (typeof escapeHtml === 'undefined') {
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

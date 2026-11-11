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
  { quote: "A little daily practice is better than hours once a week. Keep that streak alive!", author: "SpeakDaily Wisdom" }
];

// Active today topic cache
let currentTodayTopic = null;

// ─── Fetch Today's Topic ───
async function fetchTodayTopic() {
  try {
    const todayISO = new Date().toISOString().split('T')[0];
    // Attempt exact match on today's date
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

    // Fallback: fetch any active topic
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('daily_topics')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    if (fallbackError) throw fallbackError;

    if (fallbackData && fallbackData.length > 0) {
      currentTodayTopic = fallbackData[0];
      return fallbackData[0];
    }

    // Default mock topic if db table is empty
    currentTodayTopic = {
      id: 'default-topic-1',
      title: 'Introduce Yourself & Your Dreams',
      description: 'Speak for 1-2 minutes introducing who you are, what you enjoy doing, and one big dream you want to achieve this year.',
      category: 'Conversation',
      difficulty: 'beginner',
      prompt_questions: [
        'What is your name and where are you from?',
        'What is your favorite hobby and why do you love it?',
        'What is one big personal or professional goal you want to achieve?'
      ]
    };
    return currentTodayTopic;
  } catch (err) {
    console.error('fetchTodayTopic error:', err);
    currentTodayTopic = {
      id: 'default-topic-fallback',
      title: 'A Memorable Journey You Took',
      description: 'Describe a memorable trip or journey you took in the past. What made it special?',
      category: 'Travel',
      difficulty: 'intermediate',
      prompt_questions: [
        'Where did you travel to?',
        'Who went with you and how did you travel?',
        'What was the most unforgettable moment of the journey?'
      ]
    };
    return currentTodayTopic;
  }
}

// ─── Fetch User Stats ───
async function fetchUserStats() {
  if (!AppState.user) return { streak_count: 0, total_sessions: 0, avg_score: 0 };

  try {
    // 1. Profile stats
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('streak_count, total_sessions')
      .eq('id', AppState.user.id)
      .maybeSingle();

    let streak = profile?.streak_count || 0;
    let totalSessions = profile?.total_sessions || 0;

    // 2. Compute avg score from feedback
    const { data: sessions, error: sessError } = await supabase
      .from('practice_sessions')
      .select('id, ai_feedback(overall_score)')
      .eq('user_id', AppState.user.id);

    let avgScore = 0;
    if (sessions && sessions.length > 0) {
      totalSessions = Math.max(totalSessions, sessions.length);
      const scores = sessions
        .map(s => (Array.isArray(s.ai_feedback) ? s.ai_feedback[0]?.overall_score : s.ai_feedback?.overall_score))
        .filter(score => typeof score === 'number' && !isNaN(score));
      
      if (scores.length > 0) {
        avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
    }

    return {
      streak_count: streak,
      total_sessions: totalSessions,
      avg_score: avgScore
    };
  } catch (err) {
    console.error('fetchUserStats error:', err);
    return { streak_count: 0, total_sessions: 0, avg_score: 0 };
  }
}

// ─── Fetch Recent Sessions ───
async function fetchRecentSessions() {
  if (!AppState.user) return [];

  try {
    const { data, error } = await supabase
      .from('practice_sessions')
      .select(`
        id,
        duration_seconds,
        created_at,
        topic_id,
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

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('fetchRecentSessions error:', err);
    return [];
  }
}

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
    <div class="glass-card skeleton-card skeleton mb-3"></div>
    <div class="stats-grid">
      <div class="glass-card skeleton-card skeleton"></div>
      <div class="glass-card skeleton-card skeleton"></div>
      <div class="glass-card skeleton-card skeleton"></div>
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
  const [topic, stats, recentSessions] = await Promise.all([
    fetchTodayTopic(),
    fetchUserStats(),
    fetchRecentSessions()
  ]);

  const difficultyBadgeColor = {
    beginner: 'var(--color-success)',
    intermediate: 'var(--color-warning)',
    advanced: 'var(--color-secondary)'
  }[topic.difficulty?.toLowerCase()] || 'var(--color-primary)';

  // Build Recent Sessions HTML
  let recentSessionsHtml = '';
  if (recentSessions.length === 0) {
    recentSessionsHtml = `
      <div class="empty-state glass-card">
        <span class="emoji">🎙️</span>
        <h3>No practice sessions yet</h3>
        <p>Complete your first daily topic today to start tracking your fluency score!</p>
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
          const topicTitle = session.daily_topics?.title || 'Daily Speaking Practice';
          const category = session.daily_topics?.category || 'General';
          const durationMin = Math.max(1, Math.round((session.duration_seconds || 60) / 60));

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

  container.innerHTML = `
    <!-- Top Greeting -->
    <div class="greeting-section fade-in-up">
      <h1>${greetingEmoji} ${timeGreeting}, <span class="text-primary">${escapeHtml(userDisplayName)}</span></h1>
      <p>Ready to level up your English speaking confidence today?</p>
    </div>

    <!-- Daily Topic Hero Card -->
    <div class="topic-card fade-in-up">
      <div class="topic-label">🌟 TODAY'S SPEAKING TOPIC</div>
      <h2>${escapeHtml(topic.title)}</h2>
      <p>${escapeHtml(topic.description)}</p>
      <div>
        <span class="badge" style="background: rgba(255,255,255,0.25); text-transform: capitalize;">
          🎯 ${escapeHtml(topic.difficulty || 'All levels')}
        </span>
        <span class="badge" style="background: rgba(255,255,255,0.2);">
          🏷️ ${escapeHtml(topic.category || 'Conversation')}
        </span>
      </div>
      <button class="btn btn-lg" onclick="startPracticeTopic('${topic.id}')">
        🎙️ Practice This Topic Now
      </button>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid fade-in-up">
      <div class="glass-card stat-card">
        <span class="stat-emoji">🔥</span>
        <div class="stat-value">${stats.streak_count} <span style="font-size:1rem; font-weight:500;">days</span></div>
        <div class="stat-label">Current Streak</div>
      </div>
      <div class="glass-card stat-card">
        <span class="stat-emoji">🎙️</span>
        <div class="stat-value">${stats.total_sessions}</div>
        <div class="stat-label">Total Sessions</div>
      </div>
      <div class="glass-card stat-card">
        <span class="stat-emoji">🏆</span>
        <div class="stat-value">${stats.avg_score > 0 ? stats.avg_score + '%' : '--'}</div>
        <div class="stat-label">Average Score</div>
      </div>
    </div>

    <!-- Motivational Quote -->
    <div class="quote-card fade-in-up">
      <span class="emoji">💡</span>
      <blockquote>
        "${escapeHtml(randomQuote.quote)}"
        <div style="margin-top:4px; font-weight:600; color:var(--color-primary);">— ${escapeHtml(randomQuote.author)}</div>
      </blockquote>
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
}

// ─── Helper: Start Topic and Navigate ───
window.startPracticeTopic = function(topicId) {
  if (window.setActivePracticeTopic && currentTodayTopic) {
    window.setActivePracticeTopic(currentTodayTopic);
  }
  navigate('practice');
};

// ─── Simple HTML Escaper ───
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


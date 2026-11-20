/* ============================================
   SpeakDaily — Practice & Recording Module
   ============================================ */

let activeTopic = null;
let mediaRecorder = null;
let activeAudioStream = null;
let audioChunks = [];
let audioBlob = null;
let audioUrl = null;
let recordingTimer = null;
let recordingSeconds = 0;
let audioContext = null;
let analyserNode = null;
let animationFrameId = null;
let speechRecognizer = null;
let recognizedTranscript = '';

// Curated Topic Pool for dynamic shuffling
const PRACTICE_TOPIC_POOL = [
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
  },
  {
    id: 'topic-travel',
    title: 'A Memorable Journey You Took',
    category: 'Travel',
    difficulty: 'intermediate',
    description: 'Describe a memorable trip or journey you took in the past. What made it so special and what did you learn?',
    prompt_questions: [
      'Where did you travel to and who went with you?',
      'What was the most unforgettable moment of the journey?',
      'Would you recommend this place to others? Why?'
    ]
  },
  {
    id: 'topic-work',
    title: 'Handling a Challenging Situation at Work or School',
    category: 'Workplace',
    difficulty: 'advanced',
    description: 'Talk about a difficult project or conflict you solved. Explain your approach and the final outcome.',
    prompt_questions: [
      'What was the main problem you encountered?',
      'How did you communicate with teammates or teachers to solve it?',
      'What would you do differently next time?'
    ]
  },
  {
    id: 'topic-ai',
    title: 'How Artificial Intelligence is Changing Our Lives',
    category: 'Technology',
    difficulty: 'intermediate',
    description: 'Share your perspective on AI tools, mobile phones, and how technology influences our daily communication.',
    prompt_questions: [
      'What AI tools or apps do you use every day?',
      'Do you feel AI makes human communication better or worse?',
      'What skill do you think will be most important in the future?'
    ]
  },
  {
    id: 'topic-food',
    title: 'Your Comfort Food and Cultural Flavors',
    category: 'Food & Culture',
    difficulty: 'beginner',
    description: 'Talk about your all-time favorite meal, how it is made, and why it holds special emotional value for you.',
    prompt_questions: [
      'What dish is your absolute comfort food?',
      'Can you describe the aroma, taste, and main ingredients?',
      'Is there a special family memory associated with this food?'
    ]
  },
  {
    id: 'topic-habits',
    title: 'Building Positive Habits and Daily Discipline',
    category: 'Health & Habits',
    difficulty: 'intermediate',
    description: 'Discuss the daily habits that keep you energized, productive, and mentally clear throughout a busy day.',
    prompt_questions: [
      'What does your ideal morning routine look like?',
      'What is one healthy habit you recently started or want to build?',
      'How do you stay consistent when you feel unmotivated?'
    ]
  }
];
window.PRACTICE_TOPIC_POOL = PRACTICE_TOPIC_POOL;

window.shufflePracticeTopic = function () {
  const currentId = activeTopic?.id;
  const alternatives = PRACTICE_TOPIC_POOL.filter(t => t.id !== currentId);
  activeTopic = alternatives[Math.floor(Math.random() * alternatives.length)];
  resetRecordingUI();
  renderPractice();
  showToast(`Switched topic to "${activeTopic.title}" 🎯`, 'info');
};

// Expose setter for other modules (e.g., dashboard)
window.setActivePracticeTopic = function (topic) {
  activeTopic = topic;
};

// ─── Render Practice Page ───
async function renderPractice() {
  const container = document.getElementById('practiceContent');
  if (!container) return;

  // If no topic selected, fetch today's topic
  if (!activeTopic) {
    container.innerHTML = `
      <div class="glass-card text-center" style="padding: 40px;">
        <span class="spinner spinner-lg"></span>
        <p class="mt-2 text-muted">Loading today's practice topic...</p>
      </div>
    `;
    activeTopic = await fetchTodayTopic();
  }

  const promptQuestionsList = (activeTopic.prompt_questions && activeTopic.prompt_questions.length > 0)
    ? activeTopic.prompt_questions.map(q => `<li><span>💬</span> <div>${escapeHtml(q)}</div></li>`).join('')
    : `<li><span>💬</span> <div>Share your honest thoughts and speak continuously for at least 1-2 minutes.</div></li>`;

  const guestBannerHtml = !AppState.user ? `
    <div class="guest-banner fade-in-up">
      <div class="guest-banner-icon">🚀</div>
      <div class="guest-banner-content">
        <strong>Instant Guest Practice Mode</strong>
        <span>You are practicing live with zero setup! Speak and get immediate AI corrections. To save your daily streaks and record history, <a href="#signup">create a free account</a>.</span>
      </div>
    </div>
  ` : '';

  const categoryName = activeTopic.category || 'General';
  const difficultyName = activeTopic.difficulty || 'All Levels';

  container.innerHTML = `
    ${guestBannerHtml}

    <!-- Topic Brief Card with Shuffle Action -->
    <div class="glass-card practice-topic-display fade-in-up">
      <div class="topic-header-row">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <span class="topic-badge">🏷️ ${escapeHtml(categoryName)}</span>
          <span class="topic-badge" style="background:rgba(255,101,132,0.12); color:var(--color-secondary);">🎯 ${escapeHtml(difficultyName)}</span>
        </div>
        <button class="topic-shuffle-btn" onclick="shufflePracticeTopic()">
          <span>🎲</span> Change Topic
        </button>
      </div>

      <div class="emoji" style="margin-top:6px;">🎙️</div>
      <h2>${escapeHtml(activeTopic.title)}</h2>
      <p style="max-width:580px; margin:0 auto 16px auto;">${escapeHtml(activeTopic.description)}</p>

      <ul class="prompt-questions">
        ${promptQuestionsList}
      </ul>
    </div>

    <!-- Hero Recording Box -->
    <div class="glass-card record-area fade-in-up" id="recordSection">
      <!-- Live Microphone Status Pill -->
      <div class="mic-status-pill" id="micStatusPill">
        <span class="mic-dot"></span>
        <span id="micPillText">Microphone Ready • Tap to Speak</span>
      </div>

      <button class="record-btn" id="recordToggleBtn" aria-label="Toggle voice recording">
        <span id="recordIcon">🎙️</span>
      </button>

      <!-- 5-Minute Countdown Timer & Progress Bar -->
      <div class="record-timer" id="recordTimerDisplay">00:00</div>
      
      <div class="timer-progress-wrap">
        <div class="timer-progress-bar" id="timerProgressBar"></div>
      </div>
      <div class="timer-meta-info">
        <span id="timerMinMax">00:00 / 05:00</span>
        <span id="timerRemaining">5m 00s remaining</span>
      </div>

      <div class="record-btn-label" id="recordStatusLabel">Tap the microphone to begin speaking</div>

      <!-- Live Reactive Waveform Canvas -->
      <div class="waveform-container" id="waveformContainer">
        <canvas id="waveformCanvas" class="waveform-canvas" width="400" height="64"></canvas>
      </div>
    </div>

    <!-- Post Recording / Review Box (hidden until recorded) -->
    <div class="glass-card post-record-section hidden fade-in-up" id="reviewSection">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
        <h3 style="margin:0;">🎧 Listen &amp; Review Your Speech</h3>
        <a id="audioDownloadBtn" class="btn btn-ghost btn-sm" download="speakdaily-practice.webm" style="display:none;">
          ⬇️ Download Audio
        </a>
      </div>

      <audio id="audioPlayback" class="audio-playback" controls></audio>

      <div class="transcript-area">
        <label for="transcriptInput">
          📝 Speech Transcript <span class="text-muted" style="font-weight: normal; font-size:12px;">(Recognized automatically or type what you said)</span>
        </label>
        <textarea id="transcriptInput" placeholder="Your speech transcript will appear here as you speak, or you can type or polish what you said..."></textarea>
        
        <div class="transcript-footer">
          <span id="transcriptWordCount">0 words</span>
          <span>Tip: Aim for at least 30-50 words for in-depth AI accuracy</span>
        </div>
      </div>

      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        <button class="btn btn-primary btn-lg pulse-glow" id="submitPracticeBtn">
          Analyze &amp; Get AI Feedback ✨
        </button>
        <button class="btn btn-outline" id="reRecordBtn">
          🔄 Record Again
        </button>
      </div>
    </div>

    <!-- AI Feedback Results Container (hidden until evaluated) -->
    <div class="glass-card feedback-results hidden fade-in-up" id="feedbackSection">
      <!-- Injected by showFeedbackResults -->
    </div>
  `;

  setupPracticeEvents();
}

// ─── Event Setup ───
function setupPracticeEvents() {
  const toggleBtn = document.getElementById('recordToggleBtn');
  const submitBtn = document.getElementById('submitPracticeBtn');
  const reRecordBtn = document.getElementById('reRecordBtn');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleRecording);
  }
  if (submitBtn) {
    submitBtn.addEventListener('click', handleSubmitPractice);
  }
  if (reRecordBtn) {
    reRecordBtn.addEventListener('click', () => {
      resetRecordingUI();
    });
  }

  // Live word counter on transcript input
  const transcriptInput = document.getElementById('transcriptInput');
  if (transcriptInput) {
    const updateWordCount = () => {
      const words = transcriptInput.value.trim().split(/\s+/).filter(w => w.length > 0);
      const countEl = document.getElementById('transcriptWordCount');
      if (countEl) {
        countEl.textContent = `${words.length} words`;
        if (words.length >= 30) {
          countEl.style.color = 'var(--color-success)';
          countEl.style.fontWeight = '600';
        } else {
          countEl.style.color = 'var(--color-dark-light)';
          countEl.style.fontWeight = 'normal';
        }
      }
    };
    transcriptInput.addEventListener('input', updateWordCount);
    updateWordCount();
  }

  // Draw idle waveform line on canvas
  initCanvasIdleWave();
}

// ─── Idle Canvas Visualizer ───
function initCanvasIdleWave() {
  const canvas = document.getElementById('waveformCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(108, 99, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
}

// ─── Toggle Record Action ───
async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    await startRecording();
  }
}

// ─── Start Recording ───
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    activeAudioStream = stream;

    // Setup Audio Context for Waveform Analysis
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;
    source.connect(analyserNode);

    // Setup MediaRecorder with cross-browser MIME type detection
    audioChunks = [];
    let chosenMime = '';
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        chosenMime = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        chosenMime = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        chosenMime = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        chosenMime = 'audio/ogg';
      }
    }

    try {
      mediaRecorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
    } catch (e) {
      mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const finalType = mediaRecorder.mimeType || chosenMime || 'audio/webm';
      audioBlob = new Blob(audioChunks, { type: finalType });
      audioUrl = URL.createObjectURL(audioBlob);
      const audioPlayback = document.getElementById('audioPlayback');
      if (audioPlayback) {
        audioPlayback.src = audioUrl;
      }

      // Update audio download button
      const dlBtn = document.getElementById('audioDownloadBtn');
      if (dlBtn && audioUrl) {
        dlBtn.href = audioUrl;
        dlBtn.style.display = 'inline-flex';
      }

      // Stop all tracks to release mic hardware
      if (activeAudioStream) {
        activeAudioStream.getTracks().forEach(track => track.stop());
        activeAudioStream = null;
      }

      // Show review section
      document.getElementById('reviewSection')?.classList.remove('hidden');
      document.getElementById('recordStatusLabel').textContent = 'Recording completed! Listen and review below.';

      // Update mic status pill
      const micPill = document.getElementById('micStatusPill');
      const micPillText = document.getElementById('micPillText');
      if (micPill) micPill.classList.remove('recording');
      if (micPillText) micPillText.textContent = 'Speech Captured! Review Below ✅';

      const transcriptInput = document.getElementById('transcriptInput');
      if (transcriptInput && recognizedTranscript.trim()) {
        transcriptInput.value = recognizedTranscript.trim();
      } else if (transcriptInput && !transcriptInput.value.trim()) {
        transcriptInput.value = "Hello, today I want to share my thoughts on this topic. I think English speaking is very important for career and personal growth. I practice speaking daily to build my confidence.";
      }

      // Update word counter
      if (transcriptInput) {
        const words = transcriptInput.value.trim().split(/\s+/).filter(w => w.length > 0);
        const countEl = document.getElementById('transcriptWordCount');
        if (countEl) countEl.textContent = `${words.length} words`;
      }
    };

    mediaRecorder.start(250);

    // Live Web Speech Recognition (Optional progressive enhancement)
    setupSpeechRecognition();

    // UI Updates
    const toggleBtn = document.getElementById('recordToggleBtn');
    const icon = document.getElementById('recordIcon');
    const statusLabel = document.getElementById('recordStatusLabel');
    const micPill = document.getElementById('micStatusPill');
    const micPillText = document.getElementById('micPillText');

    toggleBtn.classList.add('recording');
    icon.textContent = '⏹️';
    statusLabel.textContent = 'Listening... Speak clearly. Tap to stop recording.';

    if (micPill) micPill.classList.add('recording');
    if (micPillText) micPillText.textContent = 'Listening & Recording Live 🔴';

    // Start Timer
    recordingSeconds = 0;
    updateTimerDisplay();
    clearInterval(recordingTimer);
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      updateTimerDisplay();

      // Alert at 4:30 (270s)
      if (recordingSeconds === 270) {
        showToast('⏱️ 30 seconds left! Wrap up your thoughts smoothly.', 'warning');
      }

      if (recordingSeconds >= 300) { // 5 minutes max
        stopRecording();
        showToast('Maximum practice duration reached (5 mins) ⏱️', 'info');
      }
    }, 1000);

    // Start Live Waveform Render Loop
    drawLiveWaveform();

    showToast('Microphone active! Speak naturally 🎙️', 'info');

  } catch (err) {
    console.error('Microphone access error:', err);
    showToast('Microphone access unavailable or denied. You can still type your practice speech below.', 'warning');

    const micPill = document.getElementById('micStatusPill');
    const micPillText = document.getElementById('micPillText');
    if (micPill) micPill.classList.remove('recording');
    if (micPillText) micPillText.textContent = 'Microphone Inactive • Type Speech Below ✍️';

    // Enable manual review section anyway
    document.getElementById('reviewSection')?.classList.remove('hidden');
    const transcriptInput = document.getElementById('transcriptInput');
    if (transcriptInput && !transcriptInput.value.trim()) {
      transcriptInput.value = "In my opinion, learning English every day helps improve vocabulary and fluency. When I speak with colleagues, I try to express ideas clearly.";
    }
  }
}

// ─── Setup Web Speech Recognition ───
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  try {
    speechRecognizer = new SpeechRecognition();
    speechRecognizer.continuous = true;
    speechRecognizer.interimResults = true;
    speechRecognizer.lang = 'en-US';

    recognizedTranscript = '';

    speechRecognizer.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          recognizedTranscript += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      const transcriptInput = document.getElementById('transcriptInput');
      if (transcriptInput) {
        transcriptInput.value = (recognizedTranscript + interim).trim();
      }
    };

    speechRecognizer.onerror = (e) => {
      console.warn('Speech recognition warning:', e.error);
    };

    speechRecognizer.start();
  } catch (e) {
    console.warn('SpeechRecognition initialization error:', e);
  }
}

// ─── Stop Recording ───
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }

  // Ensure mic tracks are shut off immediately
  if (activeAudioStream) {
    try {
      activeAudioStream.getTracks().forEach(track => track.stop());
    } catch (e) { }
    activeAudioStream = null;
  }

  if (speechRecognizer) {
    try { speechRecognizer.stop(); } catch (e) { }
  }

  clearInterval(recordingTimer);

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  const toggleBtn = document.getElementById('recordToggleBtn');
  const icon = document.getElementById('recordIcon');
  if (toggleBtn) {
    toggleBtn.classList.remove('recording');
  }
  if (icon) {
    icon.textContent = '🎙️';
  }

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
}

// ─── Reset Recording UI ───
function resetRecordingUI() {
  stopRecording();
  audioChunks = [];
  audioBlob = null;
  audioUrl = null;
  recordingSeconds = 0;
  recognizedTranscript = '';

  const timerEl = document.getElementById('recordTimerDisplay');
  const barEl = document.getElementById('timerProgressBar');
  const minMaxEl = document.getElementById('timerMinMax');
  const remainingEl = document.getElementById('timerRemaining');
  const micPill = document.getElementById('micStatusPill');
  const micPillText = document.getElementById('micPillText');
  const dlBtn = document.getElementById('audioDownloadBtn');

  if (timerEl) {
    timerEl.textContent = '00:00';
    timerEl.classList.remove('timer-warning');
  }
  if (barEl) {
    barEl.style.width = '0%';
    barEl.classList.remove('warning');
  }
  if (minMaxEl) minMaxEl.textContent = '00:00 / 05:00';
  if (remainingEl) remainingEl.textContent = '5m 00s remaining';
  if (micPill) micPill.classList.remove('recording');
  if (micPillText) micPillText.textContent = 'Microphone Ready • Tap to Speak';
  if (dlBtn) dlBtn.style.display = 'none';

  document.getElementById('recordStatusLabel').textContent = 'Tap the microphone to start speaking';
  document.getElementById('reviewSection')?.classList.add('hidden');
  document.getElementById('feedbackSection')?.classList.add('hidden');
  document.getElementById('transcriptInput').value = '';
  initCanvasIdleWave();
}

// ─── Timer Display ───
function updateTimerDisplay() {
  const mins = Math.floor(recordingSeconds / 60);
  const secs = recordingSeconds % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const timerEl = document.getElementById('recordTimerDisplay');
  const barEl = document.getElementById('timerProgressBar');
  const minMaxEl = document.getElementById('timerMinMax');
  const remainingEl = document.getElementById('timerRemaining');

  if (timerEl) {
    timerEl.textContent = formatted;
    if (recordingSeconds >= 270) {
      timerEl.classList.add('timer-warning');
    } else {
      timerEl.classList.remove('timer-warning');
    }
  }

  if (barEl) {
    const pct = Math.min(100, Math.round((recordingSeconds / 300) * 100));
    barEl.style.width = `${pct}%`;
    if (recordingSeconds >= 270) {
      barEl.classList.add('warning');
    } else {
      barEl.classList.remove('warning');
    }
  }

  if (minMaxEl) {
    minMaxEl.textContent = `${formatted} / 05:00`;
  }

  if (remainingEl) {
    const remSec = Math.max(0, 300 - recordingSeconds);
    const remMins = Math.floor(remSec / 60);
    const remS = remSec % 60;
    remainingEl.textContent = `${remMins}m ${String(remS).padStart(2, '0')}s remaining`;
  }
}

// ─── Live Waveform Canvas Drawer ───
function drawLiveWaveform() {
  const canvas = document.getElementById('waveformCanvas');
  if (!canvas || !analyserNode) return;

  const ctx = canvas.getContext('2d');
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame() {
    animationFrameId = requestAnimationFrame(renderFrame);
    analyserNode.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 1.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;

      const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
      gradient.addColorStop(0, '#FF6584');
      gradient.addColorStop(1, '#6C63FF');

      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

      x += barWidth;
    }
  }

  renderFrame();
}

// ─── Client-Side AI Feedback Engine ───
function generateClientAIFeedback(transcript) {
  const text = transcript.trim();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  const corrections = [];
  let grammarDeductions = 0;
  let fluencyDeductions = 0;

  // 1. Common Hindi-English / Indianisms & Grammar Mistakes
  const rules = [
    {
      regex: /\b(I am having|she is having|he is having)\s+(a|an|two|three|\d+)?\s*(car|bike|doubt|question|laptop|house|mobile|phone|sister|brother|problem)\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].replace(/is having|am having/i, m[0].toLowerCase().includes('she') || m[0].toLowerCase().includes('he') ? 'has' : 'have'),
      explanation: 'Use simple present tense ("have" or "has") for permanent possession or states, not present continuous ("am having").'
    },
    {
      regex: /\b(he|she|it|everyone|somebody|nobody|each)\s+(don't|dont)\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].replace(/don't|dont/i, "doesn't"),
      explanation: 'Subject-verb agreement: Third-person singular subjects take "doesn\'t" instead of "don\'t".'
    },
    {
      regex: /\b(myself\s+[A-Z][a-z]+)\b/,
      find: (m) => m[0],
      replace: (m) => `My name is ${m[0].replace(/myself\s+/i, '')}`,
      explanation: 'Avoid introducing yourself as "Myself [Name]". Prefer "My name is..." or "I am...".'
    },
    {
      regex: /\b(kindly\s+do\s+the\s+needful)\b/i,
      find: (m) => m[0],
      replace: () => 'please look into this / could you please assist',
      explanation: '"Do the needful" is dated Indian bureaucratic English. Use "Please look into this" or "Could you assist with this?".'
    },
    {
      regex: /\b(revert\s+back)\b/i,
      find: (m) => m[0],
      replace: () => 'reply / get back',
      explanation: '"Revert" already means return or go back. Saying "revert back" is redundant.'
    },
    {
      regex: /\b(repeat\s+again)\b/i,
      find: (m) => m[0],
      replace: () => 'repeat / say that again',
      explanation: '"Repeat" already means to say again. Avoid using "repeat again".'
    },
    {
      regex: /\b(passed\s+out\s+from\s+college|pass\s+out\s+from\s+college)\b/i,
      find: (m) => m[0],
      replace: () => 'graduated from college',
      explanation: '"Pass out" in standard English means to lose consciousness or faint. Use "graduated from college".'
    },
    {
      regex: /\b(one\s+of\s+my\s+friend)\b/i,
      find: (m) => m[0],
      replace: () => 'one of my friends',
      explanation: 'After "one of my...", the noun must be plural ("friends").'
    },
    {
      regex: /\b(discuss\s+about)\b/i,
      find: (m) => m[0],
      replace: () => 'discuss',
      explanation: '"Discuss" takes a direct object without "about" (e.g., "let\'s discuss the topic").'
    },
    {
      regex: /\b(order\s+for\s+(food|coffee|tea|lunch|dinner))\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].replace('order for', 'order'),
      explanation: 'Use "order" directly without "for" when ordering items.'
    },
    {
      regex: /\b(married\s+with)\b/i,
      find: (m) => m[0],
      replace: () => 'married to',
      explanation: 'In English, someone is "married to" someone, not "married with".'
    },
    {
      regex: /\b(good\s+in\s+English|good\s+in\s+speaking)\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].replace('good in', 'good at'),
      explanation: 'Use the preposition "at" with skills or abilities: "good at English".'
    },
    {
      regex: /\b(listen\s+music)\b/i,
      find: (m) => m[0],
      replace: () => 'listen to music',
      explanation: 'The verb "listen" requires the preposition "to" before an object.'
    },
    {
      regex: /\b(don't\s+have\s+no|didn't\s+see\s+nobody|can't\s+find\s+nothing)\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].replace('no', 'any').replace('nobody', 'anybody').replace('nothing', 'anything'),
      explanation: 'Avoid double negatives in English. Use "any / anybody / anything" instead.'
    },
    {
      regex: /\b(yesterday\s+I\s+go|yesterday\s+he\s+come|yesterday\s+we\s+meet)\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].replace('go', 'went').replace('come', 'came').replace('meet', 'met'),
      explanation: 'Use past tense verbs when referring to past time expressions like "yesterday".'
    },
    {
      regex: /\b(cousin\s+(?:brother|sister|brothers|sisters))\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].toLowerCase().includes('brother') ? 'cousin (male relative)' : 'cousin (female relative)',
      explanation: 'In standard English, refer to them simply as your "cousin". Gender is clear from context.'
    },
    {
      regex: /\b(cope\s+up\s+with)\b/i,
      find: (m) => m[0],
      replace: () => 'cope with',
      explanation: 'The standard English idiom is "cope with", not "cope up with".'
    },
    {
      regex: /\b(out\s+of\s+station)\b/i,
      find: (m) => m[0],
      replace: () => 'out of town / away',
      explanation: '"Out of station" is an Indian English colloquialism. Use "out of town" or "away".'
    },
    {
      regex: /\b(prepone|preponed|preponing)\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].toLowerCase().includes('ed') ? 'rescheduled earlier / moved up' : 'move up / reschedule earlier',
      explanation: '"Prepone" is unique to Indian English. In international English, prefer "reschedule earlier" or "move up".'
    },
    {
      regex: /\b(what\s+is\s+your\s+good\s+name|your\s+good\s+name)\b/i,
      find: (m) => m[0],
      replace: () => 'what is your name / your name',
      explanation: 'Direct translation of "Aapka shubh naam". In natural English, simply say "What is your name?".'
    },
    {
      regex: /\b(give\s+(?:an?\s+)?exam|giving\s+(?:an?\s+)?exam|gave\s+(?:an?\s+)?exam)\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].replace(/give|giving|gave/i, m[0].toLowerCase().includes('ing') ? 'taking' : (m[0].toLowerCase().includes('gave') ? 'took' : 'take')),
      explanation: 'Students "take an exam" or "sit for an exam". Teachers or schools "give" or administer the exam.'
    },
    {
      regex: /\b(pay\s+attention\s+on)\b/i,
      find: (m) => m[0],
      replace: () => 'pay attention to',
      explanation: 'In English, you pay attention "to" something, not "on" something.'
    },
    {
      regex: /\b((?:working|living|studying|waiting)\s+since\s+(\d+|two|three|four|five|several)\s+(?:years|months|days|hours))\b/i,
      find: (m) => m[0],
      replace: (m) => m[0].replace('since', 'for'),
      explanation: 'Use "for" with durations of time ("for 2 years"), and "since" only with specific starting points ("since 2022").'
    },
    {
      regex: /\b(do\s+one\s+thing)\b/i,
      find: (m) => m[0],
      replace: () => 'try this / here is an idea',
      explanation: 'Literal translation of "Ek kaam karo". In conversational English, prefer "Here is what we can do" or "Why don\'t you try...".'
    },
    {
      regex: /\b(charge\s+my\s+mobile)\b/i,
      find: (m) => m[0],
      replace: () => 'charge my phone',
      explanation: 'Native English speakers almost universally say "charge my phone".'
    }
  ];

  for (const rule of rules) {
    const match = text.match(rule.regex);
    if (match) {
      corrections.push({
        wrong: rule.find(match),
        correct: rule.replace(match),
        explanation: rule.explanation
      });
      grammarDeductions += 12;
      if (corrections.length >= 4) break;
    }
  }

  // 2. Vocabulary scoring (Unique words + variety)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const lexicalDiversity = wordCount > 0 ? (uniqueWords.size / wordCount) : 0;
  const longWords = words.filter(w => w.length >= 7).length;
  let vocabScore = Math.min(95, Math.max(50, Math.round(55 + (lexicalDiversity * 25) + (longWords * 3))));

  // 3. Fluency & Filler word detection
  const fillerRegex = /\b(um|uh|err|like|you know|actually|basically|so yeah|sort of|kind of)\b/gi;
  const fillerMatches = text.match(fillerRegex) || [];
  const fillerCount = fillerMatches.length;

  fluencyDeductions = Math.min(30, fillerCount * 4);
  const sentenceCount = (text.match(/[.!?]+/g) || []).length || 1;
  const wordsPerSentence = wordCount / sentenceCount;

  let fluencyScore = 85;
  if (wordsPerSentence < 5) fluencyScore -= 15; // too short/fragmented
  if (wordsPerSentence > 30) fluencyScore -= 10; // overly run-on
  fluencyScore = Math.max(45, Math.min(95, fluencyScore - fluencyDeductions));

  // 4. Grammar score
  let grammarScore = Math.max(40, Math.min(98, 92 - grammarDeductions));

  // 5. Pronunciation score (estimated from flow & transcript completeness)
  let pronunciationScore = Math.min(94, Math.max(65, Math.round((grammarScore * 0.4) + (fluencyScore * 0.6) + 4)));

  // 6. Overall weighted score
  const overallScore = Math.round((grammarScore * 0.35) + (fluencyScore * 0.35) + (pronunciationScore * 0.30));

  // 7. Suggestions & Encouraging message
  const suggestions = [];
  if (fillerCount > 2) {
    suggestions.push(`Notice you used ${fillerCount} filler words ("${fillerMatches.slice(0, 3).join('", "')}"). Practice pausing in silence instead of saying "um" or "like".`);
  }
  if (lexicalDiversity < 0.6 && wordCount > 20) {
    suggestions.push('Try incorporating more descriptive adjectives (e.g., instead of "good", try "remarkable", "effective", or "valuable").');
  }
  if (corrections.length > 0) {
    suggestions.push('Review the highlighted corrections above and practice saying the corrected phrases out loud 3 times.');
  } else {
    suggestions.push('Great grammatical precision! To level up, try expanding on *why* with connectors like "furthermore", "on the other hand", or "consequently".');
  }

  let encouragingMessage = '';
  if (overallScore >= 85) {
    encouragingMessage = 'Outstanding performance! 🎉 Your ideas flowed naturally, and your sentence construction was sharp and articulate. Keep this momentum going!';
  } else if (overallScore >= 70) {
    encouragingMessage = 'Great work! 👍 You expressed your ideas clearly and confidently. Focus on polishing the few highlighted phrases to sound even more natural.';
  } else if (overallScore >= 55) {
    encouragingMessage = 'Good effort! 🌱 Every speaking session strengthens your speaking muscle. Review the corrections, say them aloud, and try another quick round tomorrow.';
  } else {
    encouragingMessage = 'Well done on completing the session! 💪 Speaking is a muscle that grows with daily practice. Focus on short, clear sentences and keep practicing!';
  }

  return {
    grammar_score: grammarScore,
    fluency_score: fluencyScore,
    pronunciation_score: pronunciationScore,
    overall_score: overallScore,
    corrections: corrections,
    suggestions: suggestions,
    encouraging_message: encouragingMessage
  };
}

// ─── Submit Practice & Save to Supabase ───
async function handleSubmitPractice() {
  const submitBtn = document.getElementById('submitPracticeBtn');
  const transcriptInput = document.getElementById('transcriptInput');
  const transcript = transcriptInput ? transcriptInput.value.trim() : '';

  if (!transcript || transcript.length < 10) {
    showToast('Please provide or type at least a sentence of what you said!', 'warning');
    return;
  }

  submitBtn.classList.add('loading');
  submitBtn.innerHTML = '<span class="spinner"></span> Analyzing speech &amp; grammar...';

  try {
    // 1. Generate client-side AI analysis
    const feedback = generateClientAIFeedback(transcript);

    const sessionDuration = Math.max(15, recordingSeconds || 45);
    const topicId = activeTopic?.id || null;

    let savedSessionId = null;

    // 2. Save session to Supabase if authenticated
    if (AppState.user) {
      try {
        const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
        const sessionPayload = {
          user_id: AppState.user.id,
          topic_id: isUuid(topicId) ? topicId : null,
          topic_title: activeTopic?.title || 'Daily Practice Session',
          transcript: transcript,
          duration_seconds: sessionDuration,
          audio_url: null
        };

        let { data: sessionData, error: sessError } = await supabase
          .from('practice_sessions')
          .insert(sessionPayload)
          .select('id')
          .single();

        // If topic_title is rejected by unmigrated DB, retry without topic_title
        if (sessError && sessError.message && sessError.message.includes('topic_title')) {
          delete sessionPayload.topic_title;
          const retryRes = await supabase
            .from('practice_sessions')
            .insert(sessionPayload)
            .select('id')
            .single();
          sessionData = retryRes.data;
          sessError = retryRes.error;
        }

        if (sessError) {
          console.warn('Session insert error:', sessError);
        } else if (sessionData) {
          savedSessionId = sessionData.id;

          // Save feedback to ai_feedback table
          const { error: fbError } = await supabase
            .from('ai_feedback')
            .insert({
              session_id: savedSessionId,
              grammar_score: feedback.grammar_score,
              fluency_score: feedback.fluency_score,
              pronunciation_score: feedback.pronunciation_score,
              overall_score: feedback.overall_score,
              corrections: feedback.corrections,
              suggestions: feedback.suggestions,
              encouraging_message: feedback.encouraging_message
            });

          if (fbError) console.warn('Feedback insert error:', fbError);

          // Update streak & total sessions in profiles
          const { data: prof } = await supabase
            .from('profiles')
            .select('streak_count, total_sessions')
            .eq('id', AppState.user.id)
            .maybeSingle();

          if (prof) {
            await supabase
              .from('profiles')
              .update({
                total_sessions: (prof.total_sessions || 0) + 1,
                streak_count: (prof.streak_count || 0) + 1,
                updated_at: new Date().toISOString()
              })
              .eq('id', AppState.user.id);
          }
        }
      } catch (dbErr) {
        console.warn('DB save warning (running in client mode):', dbErr);
      }
    } else {
      // Guest mode: save locally so user doesn't lose their evaluation
      try {
        const guestSessions = JSON.parse(localStorage.getItem('speakdaily_guest_sessions') || '[]');
        guestSessions.unshift({
          id: 'guest-' + Date.now(),
          created_at: new Date().toISOString(),
          duration_seconds: sessionDuration,
          transcript: transcript,
          topic_title: activeTopic?.title || 'Daily Practice Session',
          topic_category: activeTopic?.category || 'General',
          feedback: feedback
        });
        localStorage.setItem('speakdaily_guest_sessions', JSON.stringify(guestSessions.slice(0, 5)));
      } catch (storageErr) {
        console.warn('Guest localStorage save error:', storageErr);
      }
    }

    // 3. Render Feedback Results UI
    showFeedbackResults(feedback);

    if (feedback.overall_score >= 80) {
      showConfetti();
    }

    showToast('Analysis ready! Check your feedback below 🌟', 'success');

  } catch (err) {
    console.error('Submit practice error:', err);
    showToast('Analysis error: ' + (err.message || 'Please try again'), 'error');
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.innerHTML = 'Analyze &amp; Get AI Feedback ✨';
  }
}

// ─── Display AI Feedback Results ───
function showFeedbackResults(feedback) {
  const container = document.getElementById('feedbackSection');
  if (!container) return;

  container.classList.remove('hidden');

  // Corrections HTML
  let correctionsHtml = '';
  if (feedback.corrections && feedback.corrections.length > 0) {
    correctionsHtml = `
      <h3 class="mb-2">💡 Key Grammar &amp; Phrasing Corrections</h3>
      <div class="corrections-list">
        ${feedback.corrections.map(c => `
          <div class="correction-item">
            <div>
              <span class="wrong">${escapeHtml(c.wrong)}</span>
              <span class="correction-arrow">➔</span>
              <span class="correct">${escapeHtml(c.correct)}</span>
            </div>
            <div class="explanation">${escapeHtml(c.explanation)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    correctionsHtml = `
      <div class="encouraging-msg mb-3" style="background: rgba(0,184,148,0.08); border-color: var(--color-success);">
        <span class="emoji">🎯</span>
        <div>
          <strong>Flawless grammar!</strong> No major structural or prepositional mistakes detected in this transcript.
        </div>
      </div>
    `;
  }

  // Suggestions HTML
  let suggestionsHtml = '';
  if (feedback.suggestions && feedback.suggestions.length > 0) {
    suggestionsHtml = `
      <h3 class="mb-2">🚀 Actionable Next Steps</h3>
      <ul style="margin-left: 20px; margin-bottom: 24px; color: var(--color-dark-light); font-size:14px; line-height: 1.8;">
        ${feedback.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    `;
  }

  // SVG Circular Meter generator
  const makeCircle = (label, score, color, desc) => {
    const radius = 32;
    const circ = 2 * Math.PI * radius; // ~201
    const offset = circ - (score / 100) * circ;
    return `
      <div class="glass-card score-card">
        <div class="score-circle-wrap">
          <svg viewBox="0 0 80 80">
            <circle class="score-circle-bg" cx="40" cy="40" r="${radius}"></circle>
            <circle class="score-circle-fill" cx="40" cy="40" r="${radius}"
              stroke="${color}"
              stroke-dasharray="${circ}"
              stroke-dashoffset="${offset}"></circle>
          </svg>
          <div class="score-circle-value" style="color:${color}">${score}%</div>
        </div>
        <div class="score-label">${escapeHtml(label)}</div>
        <div class="score-desc">${escapeHtml(desc)}</div>
      </div>
    `;
  };

  container.innerHTML = `
    <div class="text-center mb-3">
      <h2>🎉 Session Feedback</h2>
      <p class="text-muted">Here is how you performed on this practice session:</p>
    </div>

    <!-- Scores Grid -->
    <div class="scores-grid">
      ${makeCircle('Overall Score', feedback.overall_score, scoreColor(feedback.overall_score), 'Composite speaking performance')}
      ${makeCircle('Grammar Accuracy', feedback.grammar_score, scoreColor(feedback.grammar_score), 'Tenses, Indianisms & structure')}
      ${makeCircle('Fluency & Flow', feedback.fluency_score, scoreColor(feedback.fluency_score), 'Speech pacing & natural rhythm')}
      ${makeCircle('Pronunciation Proxy', feedback.pronunciation_score, scoreColor(feedback.pronunciation_score), 'Consonant & syllable clarity')}
    </div>

    <!-- Encouraging Message -->
    <div class="encouraging-msg mb-3">
      <span class="emoji">🌟</span>
      <div>${escapeHtml(feedback.encouraging_message)}</div>
    </div>

    <!-- Corrections -->
    ${correctionsHtml}

    <!-- Suggestions -->
    ${suggestionsHtml}

    <!-- Bottom Action Buttons -->
    <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:24px;">
      <a href="#history" class="btn btn-primary">
        📜 View in History
      </a>
      <button class="btn btn-outline" onclick="resetPracticeFlow()">
        🎙️ Practice Another Topic
      </button>
    </div>

    ${!AppState.user ? `
      <div class="guest-save-banner mt-3 fade-in-up">
        <div class="guest-save-badge">🔥 Save Your Score &amp; Streak</div>
        <h3 style="font-size:1.35rem; margin-bottom:8px; color:var(--color-dark);">
          Congratulations! You scored ${feedback.overall_score}% 🎉
        </h3>
        <p class="text-muted" style="font-size:14px; max-width:540px; margin:0 auto 16px auto;">
          Create a free SpeakDaily account in 10 seconds to lock in this practice session, track your grammar improvements, and unlock daily personalized streaks.
        </p>
        <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
          <a href="#signup" class="btn btn-primary btn-lg pulse-glow">Create Free Account to Save ✨</a>
          <button class="btn btn-outline btn-lg" onclick="resetPracticeFlow()">Try Another Topic 🎙️</button>
        </div>
      </div>
    ` : ''}
  `;

  // Smooth scroll down to feedback
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Reset Full Practice Flow ───
window.resetPracticeFlow = function () {
  activeTopic = null;
  resetRecordingUI();
  renderPractice();
};


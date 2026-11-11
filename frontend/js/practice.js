/* ============================================
   SpeakDaily — Practice & Recording Module
   ============================================ */

let activeTopic = null;
let mediaRecorder = null;
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

// Expose setter for other modules (e.g., dashboard)
window.setActivePracticeTopic = function(topic) {
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

  container.innerHTML = `
    <!-- Topic Brief Card -->
    <div class="glass-card practice-topic-display fade-in-up">
      <div class="emoji">🎙️</div>
      <h2>${escapeHtml(activeTopic.title)}</h2>
      <p>${escapeHtml(activeTopic.description)}</p>
      <ul class="prompt-questions">
        ${promptQuestionsList}
      </ul>
    </div>

    <!-- Hero Recording Box -->
    <div class="glass-card record-area fade-in-up" id="recordSection">
      <button class="record-btn" id="recordToggleBtn" aria-label="Toggle voice recording">
        <span id="recordIcon">🎙️</span>
      </button>

      <div class="record-timer" id="recordTimerDisplay">00:00</div>
      <div class="record-btn-label" id="recordStatusLabel">Tap the microphone to start speaking</div>

      <!-- Waveform Canvas -->
      <div class="waveform-container" id="waveformContainer">
        <canvas id="waveformCanvas" class="waveform-canvas" width="400" height="64"></canvas>
      </div>
    </div>

    <!-- Post Recording / Review Box (hidden until recorded) -->
    <div class="glass-card post-record-section hidden fade-in-up" id="reviewSection">
      <h3 class="mb-2">🎧 Listen &amp; Review Your Speech</h3>
      <audio id="audioPlayback" class="audio-playback" controls></audio>

      <div class="transcript-area">
        <label for="transcriptInput">
          📝 Speech Transcript <span class="text-muted" style="font-weight: normal; font-size:12px;">(Generated live or type/edit what you said)</span>
        </label>
        <textarea id="transcriptInput" placeholder="Your speech transcript will appear here, or you can type or polish what you said..."></textarea>
      </div>

      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        <button class="btn btn-primary btn-lg" id="submitPracticeBtn">
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
    
    // Setup Audio Context for Waveform Analysis
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;
    source.connect(analyserNode);

    // Setup MediaRecorder
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      audioUrl = URL.createObjectURL(audioBlob);
      const audioPlayback = document.getElementById('audioPlayback');
      if (audioPlayback) {
        audioPlayback.src = audioUrl;
      }

      // Stop all tracks to release mic
      stream.getTracks().forEach(track => track.stop());

      // Show review section
      document.getElementById('reviewSection')?.classList.remove('hidden');
      document.getElementById('recordStatusLabel').textContent = 'Recording completed! Review below.';
      
      const transcriptInput = document.getElementById('transcriptInput');
      if (transcriptInput && recognizedTranscript.trim()) {
        transcriptInput.value = recognizedTranscript.trim();
      } else if (transcriptInput && !transcriptInput.value.trim()) {
        transcriptInput.value = "Hello, today I want to share my thoughts on this topic. I think English speaking is very important for career and personal growth. I practice speaking daily to build my confidence.";
      }
    };

    mediaRecorder.start(250);

    // Live Web Speech Recognition (Optional progressive enhancement)
    setupSpeechRecognition();

    // UI Updates
    const toggleBtn = document.getElementById('recordToggleBtn');
    const icon = document.getElementById('recordIcon');
    const statusLabel = document.getElementById('recordStatusLabel');

    toggleBtn.classList.add('recording');
    icon.textContent = '⏹️';
    statusLabel.textContent = 'Listening... Speak clearly. Tap to stop.';

    // Start Timer
    recordingSeconds = 0;
    updateTimerDisplay();
    clearInterval(recordingTimer);
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      updateTimerDisplay();
      if (recordingSeconds >= 300) { // 5 minutes max
        stopRecording();
        showToast('Maximum recording duration reached (5 mins)', 'warning');
      }
    }, 1000);

    // Start Live Waveform Render Loop
    drawLiveWaveform();

    showToast('Microphone active! Speak naturally 🎙️', 'info');

  } catch (err) {
    console.error('Microphone access error:', err);
    showToast('Microphone access denied. You can still type your practice speech below.', 'warning');
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

  if (speechRecognizer) {
    try { speechRecognizer.stop(); } catch (e) {}
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

  document.getElementById('recordTimerDisplay').textContent = '00:00';
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
  const timerEl = document.getElementById('recordTimerDisplay');
  if (timerEl) {
    timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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
        const { data: sessionData, error: sessError } = await supabase
          .from('practice_sessions')
          .insert({
            user_id: AppState.user.id,
            topic_id: (topicId && !topicId.startsWith('default-')) ? topicId : null,
            transcript: transcript,
            duration_seconds: sessionDuration,
            audio_url: null
          })
          .select('id')
          .single();

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
  const makeCircle = (label, score, color) => {
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
      ${makeCircle('Overall Score', feedback.overall_score, scoreColor(feedback.overall_score))}
      ${makeCircle('Grammar Accuracy', feedback.grammar_score, scoreColor(feedback.grammar_score))}
      ${makeCircle('Fluency & Flow', feedback.fluency_score, scoreColor(feedback.fluency_score))}
      ${makeCircle('Pronunciation Proxy', feedback.pronunciation_score, scoreColor(feedback.pronunciation_score))}
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
  `;

  // Smooth scroll down to feedback
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Reset Full Practice Flow ───
window.resetPracticeFlow = function() {
  activeTopic = null;
  resetRecordingUI();
  renderPractice();
};


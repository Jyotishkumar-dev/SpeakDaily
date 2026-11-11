const express = require('express');
const { supabase } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// Smart mock AI feedback engine
// ---------------------------------------------------------------------------

/**
 * Common grammar error patterns to detect.
 * Each entry: { name, regex, message, fix(match) }
 */
const GRAMMAR_RULES = [
  {
    name: 'missing_article_before_noun',
    // Matches common nouns preceded by a verb/preposition but no article
    regex: /\b(is|was|have|has|need|want|like|see|at|in|on|to|for|with)\s+((?:big|small|good|bad|new|old|great|nice|beautiful|important)\s+)?(book|car|house|dog|cat|man|woman|child|person|phone|computer|table|chair|city|country|school|office|problem|idea|thing|place|day|time|way|world|life|job|work|game|movie|food|water|room|door|road|friend|family|question|answer|example|story)\b/gi,
    message: 'Consider adding an article ("a", "an", or "the") before the noun.',
    fix: (match) => {
      const words = match.split(/\s+/);
      const noun = words[words.length - 1];
      const vowels = 'aeiou';
      const article = vowels.includes(noun[0].toLowerCase()) ? 'an' : 'a';
      words.splice(words.length - 1, 0, article);
      return words.join(' ');
    },
  },
  {
    name: 'subject_verb_agreement_he_she',
    // "he/she go", "he/she have", "he/she do" (not auxiliary)
    regex: /\b(he|she|it)\s+(go|have|do|make|take|come|say|give|find|think|know|want|need|use|try|leave|call|run|move|live|play|work|look|seem)\b/gi,
    message: 'Subject-verb agreement: third-person singular subjects need an "-s" or "-es" on the verb.',
    fix: (match) => {
      const [subj, verb] = match.split(/\s+/);
      const irregulars = {
        go: 'goes',
        have: 'has',
        do: 'does',
      };
      const fixed =
        irregulars[verb.toLowerCase()] ||
        (verb.endsWith('y')
          ? verb.slice(0, -1) + 'ies'
          : verb + (verb.match(/[sxz]$|[sc]h$/) ? 'es' : 's'));
      return `${subj} ${fixed}`;
    },
  },
  {
    name: 'double_negative',
    regex: /\b(don't|doesn't|didn't|won't|can't|couldn't|wouldn't|shouldn't|isn't|aren't|wasn't|weren't)\s+\w+\s*(no|nothing|nobody|nowhere|neither|none)\b/gi,
    message: 'Avoid double negatives — use one negative form.',
    fix: (match) => match, // too context-dependent to auto-fix
  },
  {
    name: 'tense_inconsistency_yesterday',
    // "yesterday I go", "yesterday he play"
    regex: /\byesterday\s+(?:I|he|she|we|they|it)\s+(go|play|work|walk|talk|cook|watch|visit|call|start|finish|ask|help|clean|open|close|try|learn|study|eat|drink|buy|sell|read|write|run|come|make|take|give|find)\b/gi,
    message: 'Events in the past (e.g. "yesterday") should use past tense.',
    fix: (match) => {
      const parts = match.split(/\s+/);
      const verb = parts[parts.length - 1].toLowerCase();
      const pastForms = {
        go: 'went', play: 'played', work: 'worked', walk: 'walked',
        talk: 'talked', cook: 'cooked', watch: 'watched', visit: 'visited',
        call: 'called', start: 'started', finish: 'finished', ask: 'asked',
        help: 'helped', clean: 'cleaned', open: 'opened', close: 'closed',
        try: 'tried', learn: 'learned', study: 'studied', eat: 'ate',
        drink: 'drank', buy: 'bought', sell: 'sold', read: 'read',
        write: 'wrote', run: 'ran', come: 'came', make: 'made',
        take: 'took', give: 'gave', find: 'found',
      };
      parts[parts.length - 1] = pastForms[verb] || verb + 'ed';
      return parts.join(' ');
    },
  },
  {
    name: 'missing_to_in_infinitive',
    // "I want go", "I need go", "I would like go"
    regex: /\b(want|need|would like|plan|hope|decide|expect|promise|refuse|learn)\s+(go|play|eat|see|do|make|take|come|give|help|work|try|buy|read|write|run|find)\b/gi,
    message: 'Use "to" before the infinitive verb (e.g. "want to go").',
    fix: (match) => {
      const parts = match.split(/\s+/);
      const verb = parts[parts.length - 1];
      parts.splice(parts.length - 1, 0, 'to');
      return parts.join(' ');
    },
  },
  {
    name: 'than_vs_then',
    regex: /\b(better|worse|more|less|bigger|smaller|faster|slower|taller|shorter|older|younger|easier|harder)\s+then\b/gi,
    message: 'Use "than" for comparisons, not "then".',
    fix: (match) => match.replace(/\bthen\b/i, 'than'),
  },
  {
    name: 'their_there_they_re',
    regex: /\b(there)\s+(is|are|was|were)\s+\w+\s+(going|doing|playing|working|eating|running|talking|looking)\b/gi,
    message: 'Check if you mean "they\'re" (they are) instead of "there".',
    fix: (match) => match,
  },
  {
    name: 'redundant_that',
    regex: /\b(I think that that|I believe that that|I know that that)\b/gi,
    message: 'Remove the redundant "that".',
    fix: (match) => match.replace(/that that/i, 'that'),
  },
];

/**
 * Analyse the transcript text and produce feedback scores + corrections.
 */
function analyzeTranscript(transcript) {
  if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
    return {
      grammar_score: 0,
      fluency_score: 0,
      pronunciation_score: 50, // can't judge pronunciation from text
      overall_score: 0,
      corrections: [],
      suggestions: [],
      encouraging_message: 'We couldn\'t analyze your response — try recording a longer answer!',
    };
  }

  const text = transcript.trim();
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  const sentenceCount = sentences.length || 1;

  // -----------------------------------------------------------------------
  // 1. Grammar analysis
  // -----------------------------------------------------------------------
  const corrections = [];

  for (const rule of GRAMMAR_RULES) {
    let match;
    // Reset lastIndex
    rule.regex.lastIndex = 0;
    while ((match = rule.regex.exec(text)) !== null) {
      const original = match[0];
      const fixed = rule.fix(original);
      corrections.push({
        type: rule.name,
        original,
        corrected: fixed !== original ? fixed : null,
        message: rule.message,
        position: match.index,
      });
    }
  }

  // Penalise ~5 points per grammar error, floored at 30
  const grammarPenalty = Math.min(corrections.length * 5, 70);
  const grammarScore = Math.max(100 - grammarPenalty, 30);

  // -----------------------------------------------------------------------
  // 2. Fluency analysis — sentence length variety & complexity
  // -----------------------------------------------------------------------
  const avgSentenceLength = wordCount / sentenceCount;

  // Ideal average is 12-18 words per sentence
  let sentenceLengthScore;
  if (avgSentenceLength >= 12 && avgSentenceLength <= 18) {
    sentenceLengthScore = 100;
  } else if (avgSentenceLength >= 8 && avgSentenceLength <= 25) {
    sentenceLengthScore = 80;
  } else if (avgSentenceLength >= 5) {
    sentenceLengthScore = 60;
  } else {
    sentenceLengthScore = 40;
  }

  // Vocabulary diversity (type-token ratio)
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, '')));
  const ttr = uniqueWords.size / wordCount; // 0-1, higher is better

  let vocabScore;
  if (ttr >= 0.7) vocabScore = 100;
  else if (ttr >= 0.5) vocabScore = 80;
  else if (ttr >= 0.35) vocabScore = 60;
  else vocabScore = 40;

  // Connectors & discourse markers boost fluency
  const connectors = [
    'however', 'moreover', 'furthermore', 'therefore', 'consequently',
    'nevertheless', 'although', 'because', 'since', 'while',
    'in addition', 'on the other hand', 'for example', 'in my opinion',
    'as a result', 'in conclusion', 'first of all', 'secondly',
    'finally', 'meanwhile', 'besides', 'instead', 'otherwise',
  ];
  const lowerText = text.toLowerCase();
  const connectorCount = connectors.filter((c) => lowerText.includes(c)).length;
  const connectorBonus = Math.min(connectorCount * 5, 15);

  const fluencyScore = Math.min(
    Math.round((sentenceLengthScore * 0.4 + vocabScore * 0.4) + connectorBonus + (wordCount >= 50 ? 10 : wordCount >= 30 ? 5 : 0)),
    100
  );

  // -----------------------------------------------------------------------
  // 3. Pronunciation score — heuristic from text (limited)
  // -----------------------------------------------------------------------
  // Without audio we approximate: longer, more complex sentences suggest
  // higher confidence, so we mirror fluency with a slight random offset.
  const pronunciationScore = Math.min(
    Math.max(fluencyScore + Math.floor(Math.random() * 11) - 5, 30),
    100
  );

  // -----------------------------------------------------------------------
  // 4. Overall score
  // -----------------------------------------------------------------------
  const overallScore = Math.round(
    grammarScore * 0.35 + fluencyScore * 0.35 + pronunciationScore * 0.30
  );

  // -----------------------------------------------------------------------
  // 5. Suggestions
  // -----------------------------------------------------------------------
  const suggestions = [];

  if (wordCount < 30) {
    suggestions.push(
      'Try to speak more — aim for at least 50 words to give yourself room to express ideas fully.'
    );
  }
  if (ttr < 0.5) {
    suggestions.push(
      'Work on vocabulary diversity — try using synonyms instead of repeating the same words.'
    );
  }
  if (avgSentenceLength < 8) {
    suggestions.push(
      'Try combining short sentences with connectors like "because", "although", or "however" to sound more fluent.'
    );
  }
  if (avgSentenceLength > 25) {
    suggestions.push(
      'Some of your sentences are quite long. Try breaking them into shorter, clearer statements.'
    );
  }
  if (connectorCount === 0) {
    suggestions.push(
      'Use linking words (e.g. "however", "for example", "in my opinion") to connect your ideas more naturally.'
    );
  }
  if (corrections.length > 3) {
    suggestions.push(
      'Review basic grammar rules — focus on subject-verb agreement and verb tenses.'
    );
  }
  if (suggestions.length === 0) {
    suggestions.push(
      'Great job! Keep practicing daily to maintain your fluency and expand your vocabulary.'
    );
  }

  // -----------------------------------------------------------------------
  // 6. Encouraging message
  // -----------------------------------------------------------------------
  let encouragingMessage;
  if (overallScore >= 85) {
    encouragingMessage =
      'Excellent work! 🌟 Your English is impressive — keep up the amazing practice!';
  } else if (overallScore >= 70) {
    encouragingMessage =
      'Great job! 💪 You\'re making solid progress. A little more practice and you\'ll be even more fluent!';
  } else if (overallScore >= 50) {
    encouragingMessage =
      'Good effort! 📈 You\'re on the right track. Focus on the suggestions above and you\'ll see big improvements!';
  } else {
    encouragingMessage =
      'Keep going! 🚀 Every practice session makes you better. Don\'t be afraid to make mistakes — that\'s how we learn!';
  }

  return {
    grammar_score: grammarScore,
    fluency_score: fluencyScore,
    pronunciation_score: pronunciationScore,
    overall_score: overallScore,
    corrections,
    suggestions,
    encouraging_message: encouragingMessage,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /api/feedback — Generate AI feedback for a practice session
router.post('/', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    // Fetch the session and make sure it belongs to the user
    const { data: session, error: sessionErr } = await supabase
      .from('practice_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', req.user.id)
      .single();

    if (sessionErr || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if feedback already exists
    const { data: existing } = await supabase
      .from('ai_feedback')
      .select('*')
      .eq('session_id', session_id)
      .single();

    if (existing) {
      return res.json({ feedback: existing });
    }

    // Analyze the transcript
    const analysis = analyzeTranscript(session.transcript);

    // Save feedback to the database
    const { data: feedback, error: insertErr } = await supabase
      .from('ai_feedback')
      .insert({
        session_id,
        grammar_score: analysis.grammar_score,
        fluency_score: analysis.fluency_score,
        pronunciation_score: analysis.pronunciation_score,
        overall_score: analysis.overall_score,
        corrections: analysis.corrections,
        suggestions: analysis.suggestions,
        encouraging_message: analysis.encouraging_message,
      })
      .select()
      .single();

    if (insertErr) {
      return res.status(500).json({ error: insertErr.message });
    }

    return res.status(201).json({ feedback });
  } catch (err) {
    console.error('Generate feedback error:', err);
    return res.status(500).json({ error: 'Failed to generate feedback' });
  }
});

// GET /api/feedback/:sessionId — Get feedback for a session
router.get('/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify the session belongs to the user
    const { data: session, error: sessionErr } = await supabase
      .from('practice_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', req.user.id)
      .single();

    if (sessionErr || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { data: feedback, error } = await supabase
      .from('ai_feedback')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error || !feedback) {
      return res.status(404).json({ error: 'Feedback not found for this session' });
    }

    return res.json({ feedback });
  } catch (err) {
    console.error('Get feedback error:', err);
    return res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

module.exports = router;

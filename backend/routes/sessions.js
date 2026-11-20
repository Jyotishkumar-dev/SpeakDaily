const express = require('express');
const { supabase, getScopedClient } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/sessions — Create a new practice session
router.post('/', requireAuth, async (req, res) => {
  try {
    const { topic_id, topic_title, transcript, duration_seconds, audio_url } = req.body;

    if (!transcript) {
      return res
        .status(400)
        .json({ error: 'transcript is required' });
    }

    const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

    const client = getScopedClient(req);
    const sessionPayload = {
      user_id: req.user.id,
      topic_id: isUuid(topic_id) ? topic_id : null,
      topic_title: topic_title || 'Daily Practice Session',
      transcript,
      duration_seconds: duration_seconds || 0,
      audio_url: audio_url || null,
    };

    let { data: session, error } = await client
      .from('practice_sessions')
      .insert(sessionPayload)
      .select()
      .single();

    if (error && error.message && error.message.includes('topic_title')) {
      delete sessionPayload.topic_title;
      const retryRes = await client
        .from('practice_sessions')
        .insert(sessionPayload)
        .select()
        .single();
      session = retryRes.data;
      error = retryRes.error;
    }

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({ session });
  } catch (err) {
    console.error('Create session error:', err);
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/sessions — List current user's practice sessions
router.get('/', requireAuth, async (req, res) => {
  try {
    const client = getScopedClient(req);
    const { data: sessions, error } = await client
      .from('practice_sessions')
      .select('*, daily_topics(title, category, difficulty)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ sessions });
  } catch (err) {
    console.error('List sessions error:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/sessions/:id — Get a single session with its feedback
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: session, error } = await supabase
      .from('practice_sessions')
      .select('*, daily_topics(title, category, difficulty), ai_feedback(*)')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({ session });
  } catch (err) {
    console.error('Get session error:', err);
    return res.status(500).json({ error: 'Failed to fetch session' });
  }
});

module.exports = router;

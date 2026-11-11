const express = require('express');
const { supabase } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/sessions — Create a new practice session
router.post('/', requireAuth, async (req, res) => {
  try {
    const { topic_id, transcript, duration_seconds, audio_url } = req.body;

    if (!topic_id || !transcript) {
      return res
        .status(400)
        .json({ error: 'topic_id and transcript are required' });
    }

    const { data: session, error } = await supabase
      .from('practice_sessions')
      .insert({
        user_id: req.user.id,
        topic_id,
        transcript,
        duration_seconds: duration_seconds || 0,
        audio_url: audio_url || null,
      })
      .select()
      .single();

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
    const { data: sessions, error } = await supabase
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

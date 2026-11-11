const express = require('express');
const { supabaseAdmin, supabase } = require('../config/supabase');

const router = express.Router();

// Helper — pick the right client (admin bypasses RLS, falls back to anon)
const db = () => supabaseAdmin || supabase;

// GET /api/topics/today — Get today's topic, or a random active one
router.get('/today', async (_req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Try to find a topic for today's date
    let { data: topic, error } = await db()
      .from('daily_topics')
      .select('*')
      .eq('date', today)
      .eq('is_active', true)
      .single();

    // If none for today, pick a random active topic
    if (error || !topic) {
      const { data: topics, error: listErr } = await db()
        .from('daily_topics')
        .select('*')
        .eq('is_active', true);

      if (listErr) {
        return res.status(500).json({ error: listErr.message });
      }

      if (!topics || topics.length === 0) {
        return res.status(404).json({ error: 'No active topics available' });
      }

      topic = topics[Math.floor(Math.random() * topics.length)];
    }

    return res.json({ topic });
  } catch (err) {
    console.error('Get today topic error:', err);
    return res.status(500).json({ error: 'Failed to fetch today\'s topic' });
  }
});

// GET /api/topics — List all active topics
router.get('/', async (_req, res) => {
  try {
    const { data: topics, error } = await db()
      .from('daily_topics')
      .select('*')
      .eq('is_active', true)
      .order('date', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ topics });
  } catch (err) {
    console.error('List topics error:', err);
    return res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// GET /api/topics/:id — Get a single topic by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: topic, error } = await db()
      .from('daily_topics')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    return res.json({ topic });
  } catch (err) {
    console.error('Get topic error:', err);
    return res.status(500).json({ error: 'Failed to fetch topic' });
  }
});

module.exports = router;

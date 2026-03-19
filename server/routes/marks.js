const express = require('express');
const { getSupabaseClient } = require('../supabase');

const router = express.Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data, error: null });
}

function fail(res, status, message, details = null) {
  return res.status(status).json({
    success: false,
    data: null,
    error: {
      message,
      details,
    },
  });
}

function validateTermName(termName) {
  if (typeof termName !== 'string') {
    return 'term_name must be a string';
  }

  const trimmed = termName.trim();
  if (!trimmed) {
    return 'term_name is required';
  }

  if (trimmed.length > 80) {
    return 'term_name must be at most 80 characters';
  }

  return null;
}

router.post('/terms', async (req, res) => {
  try {
    const { user_id: userId, term_name: termName, linked_semester_id: linkedSemesterId = null } = req.body || {};

    if (!userId || !UUID_REGEX.test(userId)) {
      return fail(res, 400, 'user_id must be a valid UUID');
    }

    const termNameError = validateTermName(termName);
    if (termNameError) {
      return fail(res, 400, termNameError);
    }

    const supabase = getSupabaseClient();

    const payload = {
      user_id: userId,
      term_name: termName.trim(),
      linked_semester_id: linkedSemesterId,
    };

    const { data, error } = await supabase
      .from('marks_terms')
      .insert(payload)
      .select('id, user_id, term_name, linked_semester_id, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return fail(res, 409, 'Term name already exists for this user', error.message);
      }
      return fail(res, 500, 'Failed to create term', error.message);
    }

    return ok(res, data, 201);
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

router.get('/terms/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!UUID_REGEX.test(userId)) {
      return fail(res, 400, 'userId must be a valid UUID');
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('marks_terms')
      .select('id, user_id, term_name, linked_semester_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return fail(res, 500, 'Failed to fetch terms', error.message);
    }

    return ok(res, data || []);
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

module.exports = router;

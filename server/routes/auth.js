const express = require('express');
const { getSupabaseClient } = require('../supabase');

const router = express.Router();

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

function validateEmail(email) {
  if (typeof email !== 'string') {
    return 'email is required';
  }

  const cleaned = email.trim().toLowerCase();
  if (!cleaned) {
    return 'email is required';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) {
    return 'email must be valid';
  }

  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'password must be at least 8 characters long';
  }

  return null;
}

router.post('/signup', async (req, res) => {
  try {
    const {
      email,
      password,
      full_name: fullName,
      program_code: programCode,
      program_title: programTitle,
      program_level: programLevel,
      program_credits: programCredits,
    } = req.body || {};

    const emailError = validateEmail(email);
    if (emailError) {
      return fail(res, 400, emailError);
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return fail(res, 400, passwordError);
    }

    const supabase = getSupabaseClient();

    const payload = {
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: typeof fullName === 'string' ? fullName.trim() : '',
        program_code: typeof programCode === 'string' ? programCode.trim() : '',
        program_title: typeof programTitle === 'string' ? programTitle.trim() : '',
        program_level: typeof programLevel === 'string' ? programLevel.trim() : '',
        program_credits: typeof programCredits === 'string' ? programCredits.trim() : '',
      },
    };

    const { data, error } = await supabase.auth.admin.createUser(payload);

    if (error) {
      const message = (error.message || '').toLowerCase();
      if (message.includes('already') || message.includes('exists') || message.includes('registered')) {
        return fail(res, 409, 'An account already exists with this email', error.message);
      }

      return fail(res, 500, 'Failed to create account', error.message);
    }

    return ok(
      res,
      {
        user_id: data.user?.id || null,
        email: data.user?.email || payload.email,
        message: 'Account created and email confirmed',
      },
      201
    );
  } catch (err) {
    return fail(res, 500, 'Unexpected server error', err.message);
  }
});

module.exports = router;
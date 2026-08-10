const rateLimit = require('express-rate-limit');

// Login is the primary brute-force/credential-stuffing target, so it gets
// the tightest cap. Keyed by IP (see `trust proxy` in app.js, required for
// req.ip to reflect the real client behind Vercel's proxy).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
});

// Looser cap for the other auth endpoints (register/invite/refresh) -- not
// brute-force targets in the same way, but still worth bounding against
// spam/enumeration.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

module.exports = { loginLimiter, authLimiter };

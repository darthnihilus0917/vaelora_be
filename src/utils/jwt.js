const jwt = require('jsonwebtoken');

// Supabase issues HS256 JWTs signed with the project's JWT secret (Settings ->
// API -> JWT Secret). Verifying locally avoids a network round-trip to Supabase
// on every authenticated request.
function verifySupabaseToken(token) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not configured');

  return jwt.verify(token, secret, { algorithms: ['HS256'] });
}

module.exports = { verifySupabaseToken };

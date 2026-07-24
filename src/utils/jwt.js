const { jwtVerify, createRemoteJWKSet } = require('jose');

// Supabase now issues ES256 JWTs signed with per-project rotating keys
// (Settings -> API -> JWT Keys), not the legacy static HS256 secret. Verify
// against the project's public JWKS instead; jose caches/rotates it
// internally so this doesn't hit the network on every request.
let jwks;
function getJwks() {
  if (!jwks) {
    if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL is not configured');
    jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', process.env.SUPABASE_URL));
  }
  return jwks;
}

async function verifySupabaseToken(token) {
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
  });
  return payload;
}

module.exports = { verifySupabaseToken };

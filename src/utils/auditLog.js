const supabase = require('../config/supabaseClient');

function clientIp(req) {
  if (!req) return null;
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || null;
}

// Writes to auth_audit_log (id, user_id, event_type, details jsonb, ip_address,
// created_at). Logging must never break the auth flow it's attached to, so
// failures here are swallowed (and reported to the console) rather than thrown.
async function logAuthEvent({ userId = null, eventType, details = null, req = null }) {
  try {
    const { error } = await supabase.from('auth_audit_log').insert([
      {
        user_id: userId,
        event_type: eventType,
        details,
        ip_address: clientIp(req),
      },
    ]);

    if (error) console.error(`auth_audit_log insert failed (${eventType}):`, error.message);
  } catch (err) {
    console.error(`auth_audit_log insert threw (${eventType}):`, err.message);
  }
}

module.exports = { logAuthEvent };

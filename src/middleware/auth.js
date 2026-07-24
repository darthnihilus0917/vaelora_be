const supabase = require('../config/supabaseClient');
const { verifySupabaseToken } = require('../utils/jwt');

function extractToken(req) {
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// Verifies the Supabase-issued JWT and attaches req.user from user_profiles
// (role/is_active live in Postgres, not the token, so this is a DB lookup on
// every request). 401 on missing/invalid/expired token or missing profile,
// 403 if the account has been deactivated.
const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) throw { status: 401, message: 'Missing or malformed Authorization header' };

    let payload;
    try {
      payload = verifySupabaseToken(token);
    } catch (err) {
      throw { status: 401, message: 'Invalid or expired token' };
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, is_active')
      .eq('id', payload.sub)
      .single();

    if (error || !profile) throw { status: 401, message: 'User profile not found' };
    if (!profile.is_active) throw { status: 403, message: 'Account is deactivated' };

    req.user = {
      id: profile.id,
      email: payload.email || null,
      full_name: profile.full_name,
      role: profile.role,
      is_active: profile.is_active,
    };
    req.accessToken = token;

    next();
  } catch (err) {
    next(err);
  }
};

// requireRole('admin', 'superadmin') -> 403 unless req.user.role is one of these.
// Always place authenticate before this so req.user is populated.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next({ status: 401, message: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return next({ status: 403, message: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };

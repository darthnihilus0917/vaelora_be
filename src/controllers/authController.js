const supabase = require('../config/supabaseClient');
const { logAuthEvent } = require('../utils/auditLog');
const { getValidRoleNames } = require('../utils/roles');

// A DB trigger auto-creates a user_profiles row per auth.users signup and
// auto-promotes the very first one to superadmin. Self-registration is only
// meant to bootstrap that first account; count is a cheap proxy for "any
// users exist yet" without needing the admin listUsers API.
async function isFirstUser() {
  const { count, error } = await supabase.from('user_profiles').select('*', { count: 'exact', head: true });
  if (error) throw { status: 500, message: error.message };
  return (count || 0) === 0;
}

function serializeProfile(profile, email) {
  return {
    id: profile.id,
    email,
    full_name: profile.full_name,
    role: profile.role,
    is_active: profile.is_active,
  };
}

const register = async (req, res, next) => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
      throw { status: 400, message: 'email and password are required' };
    }

    if (!(await isFirstUser())) {
      throw { status: 403, message: 'Self-registration is closed. Ask an admin to invite you instead.' };
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: full_name ? { full_name } : undefined,
    });
    if (createError) throw { status: 400, message: createError.message };

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw { status: 400, message: signInError.message };

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, is_active')
      .eq('id', created.user.id)
      .single();
    if (profileError || !profile) {
      throw { status: 500, message: 'User created but profile lookup failed' };
    }

    await logAuthEvent({ userId: profile.id, eventType: 'LOGIN', details: { via: 'register' }, req });

    res.status(201).json({
      success: true,
      data: { session: signInData.session, profile: serializeProfile(profile, email) },
    });
  } catch (err) {
    next(err);
  }
};

// Only a superadmin may grant admin/superadmin; admins are limited to
// staff/viewer. Prevents a compromised or careless admin account from
// minting more admins/superadmins via invite.
function canAssignRole(inviterRole, targetRole) {
  if (inviterRole === 'superadmin') return true;
  if (inviterRole === 'admin') return ['staff', 'viewer'].includes(targetRole);
  return false;
}

const invite = async (req, res, next) => {
  try {
    const { email, full_name, role } = req.body;

    if (!email) throw { status: 400, message: 'email is required' };
    const validRoles = await getValidRoleNames();
    if (!role || !validRoles.includes(role)) {
      throw { status: 400, message: `role is required and must be one of ${validRoles.join(', ')}` };
    }
    if (!canAssignRole(req.user.role, role)) {
      throw { status: 403, message: `Your role (${req.user.role}) cannot invite a user as ${role}` };
    }

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: full_name ? { full_name } : undefined,
    });
    if (error) throw { status: 400, message: error.message };

    // The signup trigger gives every non-first user a default role; override
    // it here to whatever the inviter actually requested.
    const { error: roleError } = await supabase
      .from('user_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', data.user.id);
    if (roleError) throw { status: 500, message: `Invite sent but role assignment failed: ${roleError.message}` };

    await logAuthEvent({
      userId: req.user.id,
      eventType: 'ROLE_CHANGE',
      details: { action: 'invite', invited_user_id: data.user.id, invited_email: email, assigned_role: role },
      req,
    });

    res.status(201).json({ success: true, data: { id: data.user.id, email, role } });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw { status: 400, message: 'email and password are required' };

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      await logAuthEvent({ eventType: 'LOGIN_FAILED', details: { email, reason: error.message }, req });
      throw { status: 401, message: 'Invalid email or password' };
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, is_active')
      .eq('id', data.user.id)
      .single();
    if (profileError || !profile) {
      throw { status: 401, message: 'User profile not found' };
    }

    if (!profile.is_active) {
      await logAuthEvent({ userId: profile.id, eventType: 'LOGIN_FAILED', details: { email, reason: 'account_deactivated' }, req });
      throw { status: 403, message: 'Account is deactivated' };
    }

    await logAuthEvent({ userId: profile.id, eventType: 'LOGIN', details: { email }, req });

    res.json({
      success: true,
      data: { session: data.session, profile: serializeProfile(profile, email) },
    });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const { error } = await supabase.auth.admin.signOut(req.accessToken, 'global');
    if (error) throw { status: 400, message: error.message };

    await logAuthEvent({ userId: req.user.id, eventType: 'LOGOUT', req });

    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) throw { status: 400, message: 'refresh_token is required' };

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error) throw { status: 401, message: 'Invalid or expired refresh token' };

    res.json({ success: true, data: { session: data.session } });
  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    res.json({ success: true, data: serializeProfile(req.user, req.user.email) });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, invite, login, logout, refresh, me };

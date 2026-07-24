const supabase = require('../config/supabaseClient');
const { logAuthEvent } = require('../utils/auditLog');

const VALID_ROLES = ['viewer', 'staff', 'admin', 'superadmin'];

const getAll = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, is_active, created_at, updated_at')
      .order('created_at', { ascending: true });

    if (error) throw { status: 400, message: error.message };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const updateRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Prevents a superadmin from locking themselves (or the whole account)
    // out by demoting their own only-superadmin session.
    if (id === req.user.id) {
      throw { status: 400, message: 'Cannot change your own role via this endpoint' };
    }
    if (!VALID_ROLES.includes(role)) {
      throw { status: 400, message: `role must be one of ${VALID_ROLES.join(', ')}` };
    }

    const { data: before, error: beforeError } = await supabase
      .from('user_profiles')
      .select('id, role')
      .eq('id', id)
      .single();
    if (beforeError || !before) throw { status: 404, message: 'User not found' };

    const { data, error } = await supabase
      .from('user_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, full_name, role, is_active')
      .single();
    if (error) throw { status: 400, message: error.message };

    await logAuthEvent({
      userId: req.user.id,
      eventType: 'ROLE_CHANGE',
      details: { target_user_id: id, from_role: before.role, to_role: role },
      req,
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const setActive = (isActive, eventType) => async (req, res, next) => {
  try {
    const { id } = req.params;

    if (isActive === false && id === req.user.id) {
      throw { status: 400, message: 'Cannot deactivate your own account via this endpoint' };
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, full_name, role, is_active')
      .single();
    if (error) throw { status: 400, message: error.message };
    if (!data) throw { status: 404, message: 'User not found' };

    await logAuthEvent({ userId: req.user.id, eventType, details: { target_user_id: id }, req });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  updateRole,
  deactivate: setActive(false, 'ACCOUNT_DEACTIVATED'),
  activate: setActive(true, 'ACCOUNT_ACTIVATED'),
};

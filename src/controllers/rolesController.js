const supabase = require('../config/supabaseClient');

// System roles (superadmin/admin/staff/viewer) are referenced by literal
// name in DB functions (is_superadmin, is_admin_or_above, handle_new_user
// trigger) and in this API's own role-hierarchy checks (canAssignRole in
// authController). Renaming or deleting one would silently break those, so
// both are blocked here regardless of caller role.
const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

const getAll = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('roles').select('*').order('id', { ascending: true });
    if (error) throw { status: 400, message: error.message };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getByName = async (req, res, next) => {
  try {
    const { name } = req.params;
    const { data, error } = await supabase.from('roles').select('*').eq('name', name).single();

    if (error || !data) throw { status: 404, message: 'Role not found' };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name || !NAME_PATTERN.test(name)) {
      throw { status: 400, message: 'name is required and must be lowercase letters, numbers, or underscores, starting with a letter' };
    }

    const { data, error } = await supabase
      .from('roles')
      .insert([{ name, description: description ?? null, is_system: false }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw { status: 409, message: `Role '${name}' already exists` };
      throw { status: 400, message: error.message };
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { name } = req.params;
    const { name: newName, description } = req.body;

    const { data: existing, error: existingError } = await supabase.from('roles').select('*').eq('name', name).single();
    if (existingError || !existing) throw { status: 404, message: 'Role not found' };

    const payload = { updated_at: new Date().toISOString() };

    if (newName !== undefined && newName !== name) {
      if (existing.is_system) {
        throw { status: 403, message: `Cannot rename system role '${name}'` };
      }
      if (!NAME_PATTERN.test(newName)) {
        throw { status: 400, message: 'name must be lowercase letters, numbers, or underscores, starting with a letter' };
      }
      payload.name = newName;
    }
    if (description !== undefined) payload.description = description;

    const { data, error } = await supabase.from('roles').update(payload).eq('name', name).select().single();

    if (error) {
      if (error.code === '23505') throw { status: 409, message: `Role '${newName}' already exists` };
      throw { status: 400, message: error.message };
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const { name } = req.params;

    const { data: existing, error: existingError } = await supabase.from('roles').select('*').eq('name', name).single();
    if (existingError || !existing) throw { status: 404, message: 'Role not found' };
    if (existing.is_system) throw { status: 403, message: `Cannot delete system role '${name}'` };

    const { error } = await supabase.from('roles').delete().eq('name', name);

    if (error) {
      // 23503 = foreign_key_violation. user_profiles.role is ON DELETE
      // RESTRICT, so this fires for any role still assigned to a user.
      if (error.code === '23503') {
        throw { status: 409, message: `Cannot delete role '${name}': still assigned to one or more users` };
      }
      throw { status: 400, message: error.message };
    }

    res.json({ success: true, message: `Role '${name}' deleted` });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getByName, create, update, remove };

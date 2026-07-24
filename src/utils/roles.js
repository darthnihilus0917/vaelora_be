const supabase = require('../config/supabaseClient');

// Role names now live in the roles table (see migration
// roles_table_and_user_profiles_fk) instead of being hardcoded here.
async function getValidRoleNames() {
  const { data, error } = await supabase.from('roles').select('name');
  if (error) throw { status: 500, message: `Failed to load roles: ${error.message}` };
  return data.map((r) => r.name);
}

module.exports = { getValidRoleNames };

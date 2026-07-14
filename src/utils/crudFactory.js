const supabase = require('../config/supabaseClient');

// Builds getAll/getById/create/update/remove handlers for a Supabase table.
// Read-only resources (writable: false) only get getAll.
function buildCrudHandlers(table, { writable = true } = {}) {
  const getAll = async (req, res, next) => {
    try {
      const { data, error } = await supabase.from(table).select('*');

      if (error) throw { status: 400, message: error.message };

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  if (!writable) {
    return { getAll };
  }

  const getById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();

      if (error) throw { status: 404, message: `Record not found in ${table}` };

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  const create = async (req, res, next) => {
    try {
      const { data, error } = await supabase.from(table).insert([req.body]).select().single();

      if (error) throw { status: 400, message: error.message };

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  const update = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase.from(table).update(req.body).eq('id', id).select().single();

      if (error) throw { status: 400, message: error.message };
      if (!data) throw { status: 404, message: `Record not found in ${table}` };

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  const remove = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { error } = await supabase.from(table).delete().eq('id', id);

      if (error) throw { status: 400, message: error.message };

      res.json({ success: true, message: `Record ${id} deleted from ${table}` });
    } catch (err) {
      next(err);
    }
  };

  return { getAll, getById, create, update, remove };
}

module.exports = buildCrudHandlers;

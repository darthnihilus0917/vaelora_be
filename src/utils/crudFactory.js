const supabase = require('../config/supabaseClient');

// Pagination/sorting is opt-in: only kicks in when the caller sends page,
// limit, or sortBy. No params -> unchanged plain-array behavior, so existing
// callers (e.g. dropdown lookups) aren't affected by this response shape.
function parseListParams(query) {
  if (query.page === undefined && query.limit === undefined && query.sortBy === undefined) {
    return null;
  }

  return {
    page: Math.max(1, parseInt(query.page, 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20)),
    sortBy: query.sortBy || null,
    sortOrder: query.sortOrder === 'desc' ? 'desc' : 'asc',
  };
}

// Builds getAll/getById/create/update/remove handlers for a Supabase table.
// Read-only resources (writable: false) only get getAll.
function buildCrudHandlers(table, { writable = true } = {}) {
  const getAll = async (req, res, next) => {
    try {
      const listParams = parseListParams(req.query);

      if (!listParams) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw { status: 400, message: error.message };
        return res.json({ success: true, data });
      }

      const { page, limit, sortBy, sortOrder } = listParams;
      let query = supabase.from(table).select('*', { count: 'exact' });
      if (sortBy) query = query.order(sortBy, { ascending: sortOrder === 'asc' });
      query = query.range((page - 1) * limit, page * limit - 1);

      const { data, error, count } = await query;
      if (error) throw { status: 400, message: error.message };

      res.json({
        success: true,
        data: {
          items: data,
          page,
          limit,
          total: count,
          totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
        },
      });
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

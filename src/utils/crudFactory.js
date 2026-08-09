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

// Keeps only whitelisted keys from the request body. The DB client is
// service_role (bypasses RLS), so this whitelist is what actually stops a
// caller from writing to columns the API doesn't mean to expose (id,
// created_at, or anything else that happens to exist on the table).
function pickFields(body, fields) {
  const picked = {};
  fields.forEach((field) => {
    if (body[field] !== undefined) picked[field] = body[field];
  });
  return picked;
}

// Builds getAll/getById/create/update/remove handlers for a Supabase table.
// Read-only resources (writable: false) only get getAll.
// softDelete: DELETE becomes an is_active=false update instead of a real
// delete, and GET list hides inactive rows unless ?includeInactive=true.
function buildCrudHandlers(table, { writable = true, softDelete = false, fields = [] } = {}) {
  const getAll = async (req, res, next) => {
    try {
      const listParams = parseListParams(req.query);
      const hideInactive = softDelete && req.query.includeInactive !== 'true';

      if (!listParams) {
        let query = supabase.from(table).select('*');
        if (hideInactive) query = query.eq('is_active', true);

        const { data, error } = await query;
        if (error) throw { status: 400, message: error.message };
        return res.json({ success: true, data });
      }

      const { page, limit, sortBy, sortOrder } = listParams;
      let query = supabase.from(table).select('*', { count: 'exact' });
      if (hideInactive) query = query.eq('is_active', true);
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
      const payload = pickFields(req.body, fields);
      const { data, error } = await supabase.from(table).insert([payload]).select().single();

      if (error) throw { status: 400, message: error.message };

      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  const update = async (req, res, next) => {
    try {
      const { id } = req.params;
      const payload = pickFields(req.body, fields);
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();

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

      if (softDelete) {
        const { data, error } = await supabase
          .from(table)
          .update({ is_active: false })
          .eq('id', id)
          .select()
          .single();

        if (error) throw { status: 400, message: error.message };
        if (!data) throw { status: 404, message: `Record not found in ${table}` };

        return res.json({ success: true, message: `Record ${id} deactivated in ${table}`, data });
      }

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

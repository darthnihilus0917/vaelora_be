const supabase = require('../config/supabaseClient');

// No slugify precedent exists elsewhere in the codebase; this is the minimal
// version needed here (matches the shape of the slugs already seeded, e.g.
// "Giorgio Armani" -> "giorgio-armani").
function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// products(count) comes back embedded as products: [{ count: N }]; flatten
// that into a plain product_count field for the response.
function flattenBrand({ products, ...brand }) {
  return { ...brand, product_count: Array.isArray(products) ? products[0]?.count ?? 0 : 0 };
}

const getAll = async (req, res, next) => {
  try {
    const { search, is_active, page, limit, sortBy, sortOrder } = req.query;

    let query = supabase.from('brands').select('*, products(count)', { count: 'exact' });

    if (search) query = query.ilike('name', `%${search}%`);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

    // Pagination/sorting is opt-in, same as every other list endpoint in this
    // API: no page/limit/sortBy -> plain array, so existing callers/dropdowns
    // are unaffected.
    const hasListParams = page !== undefined || limit !== undefined || sortBy !== undefined;

    if (!hasListParams) {
      const { data, error } = await query;
      if (error) throw { status: 400, message: error.message };
      return res.json({ success: true, data: data.map(flattenBrand) });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const sortOrderVal = sortOrder === 'desc' ? 'desc' : 'asc';

    if (sortBy) query = query.order(sortBy, { ascending: sortOrderVal === 'asc' });
    query = query.range((pageNum - 1) * limitNum, pageNum * limitNum - 1);

    const { data, error, count } = await query;
    if (error) throw { status: 400, message: error.message };

    res.json({
      success: true,
      data: {
        items: data.map(flattenBrand),
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.max(1, Math.ceil((count || 0) / limitNum)),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('brands').select('*, products(count)').eq('id', id).single();

    if (error) throw { status: 404, message: 'Record not found in brands' };

    res.json({ success: true, data: flattenBrand(data) });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { name, slug, description, is_active } = req.body;

    if (!name || !String(name).trim()) {
      throw { status: 400, message: 'name is required' };
    }

    const payload = {
      name: name.trim(),
      slug: slugify(slug || name),
      description: description ?? null,
      is_active: is_active === undefined ? true : !!is_active,
    };

    const { data, error } = await supabase.from('brands').insert([payload]).select().single();

    if (error) throw { status: 400, message: error.message };

    res.status(201).json({ success: true, data: { ...data, product_count: 0 } });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, slug, description, is_active } = req.body;

    if (!name || !String(name).trim()) {
      throw { status: 400, message: 'name is required' };
    }

    const payload = {
      name: name.trim(),
      slug: slugify(slug || name),
      description: description ?? null,
      is_active: is_active === undefined ? true : !!is_active,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('brands').update(payload).eq('id', id).select().single();

    if (error) throw { status: 400, message: error.message };
    if (!data) throw { status: 404, message: 'Record not found in brands' };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const patch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = {};

    ['name', 'slug', 'description', 'is_active'].forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    });

    if (payload.name !== undefined && !String(payload.name).trim()) {
      throw { status: 400, message: 'name cannot be blank' };
    }
    if (payload.slug !== undefined) payload.slug = slugify(payload.slug);
    if (payload.is_active !== undefined) payload.is_active = !!payload.is_active;
    if (Object.keys(payload).length === 0) {
      throw { status: 400, message: 'No updatable fields provided' };
    }

    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('brands').update(payload).eq('id', id).select().single();

    if (error) throw { status: 400, message: error.message };
    if (!data) throw { status: 404, message: 'Record not found in brands' };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('brands').delete().eq('id', id);

    if (error) {
      // 23503 = foreign_key_violation. products.brand_id is ON DELETE
      // RESTRICT, so this fires for any brand that still has products.
      if (error.code === '23503') {
        throw { status: 409, message: 'Cannot delete a brand that still has products. Deactivate it instead.' };
      }
      throw { status: 400, message: error.message };
    }

    res.json({ success: true, message: `Record ${id} deleted from brands` });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById, create, update, patch, remove };

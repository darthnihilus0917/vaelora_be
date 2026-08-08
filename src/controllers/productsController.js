const supabase = require('../config/supabaseClient');
const { uploadImage, deleteImage } = require('../utils/r2Storage');

const IMAGE_COLUMNS = 'id, url, is_default, sort_order, created_at';

// Pagination/sorting is opt-in, same convention as every other list endpoint
// in this API: no page/limit/sortBy -> plain array, so existing callers
// (e.g. dropdown lookups) are unaffected.
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

const getAll = async (req, res, next) => {
  try {
    const listParams = parseListParams(req.query);

    if (!listParams) {
      const { data, error } = await supabase.from('products').select(`*, product_images(${IMAGE_COLUMNS})`);
      if (error) throw { status: 400, message: error.message };
      return res.json({ success: true, data });
    }

    const { page, limit, sortBy, sortOrder } = listParams;
    let query = supabase.from('products').select(`*, product_images(${IMAGE_COLUMNS})`, { count: 'exact' });
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

const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('products')
      .select(`*, product_images(${IMAGE_COLUMNS})`)
      .eq('id', id)
      .single();

    if (error) throw { status: 404, message: 'Record not found in products' };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('products').insert([req.body]).select().single();

    if (error) throw { status: 400, message: error.message };

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('products').update(req.body).eq('id', id).select().single();

    if (error) throw { status: 400, message: error.message };
    if (!data) throw { status: 404, message: 'Record not found in products' };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    // product_images rows cascade-delete in Postgres, but the R2 objects
    // they point at don't — fetch keys first so we can clean those up too.
    const { data: images } = await supabase.from('product_images').select('storage_key').eq('product_id', id);

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw { status: 400, message: error.message };

    if (images && images.length) {
      await Promise.allSettled(images.map((img) => deleteImage(img.storage_key)));
    }

    res.json({ success: true, message: `Record ${id} deleted from products` });
  } catch (err) {
    next(err);
  }
};

const listImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', id)
      .order('sort_order', { ascending: true });

    if (error) throw { status: 400, message: error.message };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// POST /:id/images (multipart/form-data, field "images", up to 10 files).
// Optional form field "defaultIndex" picks which uploaded file (0-based,
// within this batch) becomes the product's default image. If the product
// has no images yet and defaultIndex isn't given, the first uploaded file
// becomes the default automatically.
const uploadImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const files = req.files || [];

    if (files.length === 0) {
      throw { status: 400, message: 'At least one image file is required (field name: images)' };
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('id', id)
      .single();
    if (productError || !product) throw { status: 404, message: 'Product not found' };

    const { count: existingCount, error: countError } = await supabase
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id);
    if (countError) throw { status: 400, message: countError.message };

    let defaultIdx = null;
    if (req.body.defaultIndex !== undefined) {
      const parsed = parseInt(req.body.defaultIndex, 10);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed < files.length) defaultIdx = parsed;
    } else if (!existingCount) {
      defaultIdx = 0;
    }

    const uploaded = [];
    for (let i = 0; i < files.length; i += 1) {
      // Sequential (not Promise.all) to keep sort_order/upload order stable
      // and predictable under R2 rate limits.
      // eslint-disable-next-line no-await-in-loop
      const { key, url } = await uploadImage(id, files[i]);
      uploaded.push({
        product_id: id,
        storage_key: key,
        url,
        is_default: i === defaultIdx,
        sort_order: (existingCount || 0) + i,
      });
    }

    if (defaultIdx !== null) {
      await supabase
        .from('product_images')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('product_id', id)
        .eq('is_default', true);
    }

    const { data, error } = await supabase.from('product_images').insert(uploaded).select();
    if (error) {
      // Best-effort cleanup so a failed insert doesn't orphan R2 objects.
      await Promise.allSettled(uploaded.map((img) => deleteImage(img.storage_key)));
      throw { status: 400, message: error.message };
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const setDefaultImage = async (req, res, next) => {
  try {
    const { id, imageId } = req.params;

    const { data: image, error: fetchError } = await supabase
      .from('product_images')
      .select('id')
      .eq('id', imageId)
      .eq('product_id', id)
      .single();
    if (fetchError || !image) throw { status: 404, message: 'Image not found for this product' };

    await supabase
      .from('product_images')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('product_id', id)
      .eq('is_default', true);

    const { data, error } = await supabase
      .from('product_images')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', imageId)
      .select()
      .single();
    if (error) throw { status: 400, message: error.message };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const deleteProductImage = async (req, res, next) => {
  try {
    const { id, imageId } = req.params;

    const { data: image, error: fetchError } = await supabase
      .from('product_images')
      .select('*')
      .eq('id', imageId)
      .eq('product_id', id)
      .single();
    if (fetchError || !image) throw { status: 404, message: 'Image not found for this product' };

    const { error: deleteError } = await supabase.from('product_images').delete().eq('id', imageId);
    if (deleteError) throw { status: 400, message: deleteError.message };

    await deleteImage(image.storage_key);

    // Keep the "at most one default, and one exists if any images do"
    // invariant: promote the next image when the default gets deleted.
    if (image.is_default) {
      const { data: nextImage } = await supabase
        .from('product_images')
        .select('id')
        .eq('product_id', id)
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextImage) {
        await supabase
          .from('product_images')
          .update({ is_default: true, updated_at: new Date().toISOString() })
          .eq('id', nextImage.id);
      }
    }

    res.json({ success: true, message: `Image ${imageId} deleted from product ${id}` });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  listImages,
  uploadImages,
  setDefaultImage,
  deleteProductImage,
};

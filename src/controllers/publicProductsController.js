const supabase = require('../config/supabaseClient');

// Public catalog fields only. Never add average_acquisition_price,
// available_inventory_cost, or any other cost/margin field here — this
// response is genuinely anonymous, no auth check at all (see publicRoutes.js).
const PRODUCT_SELECT = [
  'id',
  'sku',
  'brand',
  'model_no',
  'product_name',
  'condition_label',
  'movement_type',
  'case_size',
  'gender_label',
  'description',
  'created_at',
  'categories(name)',
  'product_images(url, is_default, sort_order)',
].join(', ');

function mapProduct(product, stock) {
  const images = (product.product_images || [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ url, is_default, sort_order }) => ({ url, is_default, sort_order }));

  return {
    id: product.id,
    sku: product.sku,
    name: product.product_name,
    brand: product.brand,
    model_no: product.model_no,
    category: product.categories?.name ?? null,
    condition_label: product.condition_label ?? null,
    movement_type: product.movement_type ?? null,
    case_size: product.case_size ?? null,
    gender_label: product.gender_label ?? null,
    description: product.description ?? null,
    price: stock ? Number(stock.average_current_selling_price) : null,
    images,
    created_at: product.created_at,
  };
}

// "In stock" is computed from product_stock_summary (already aggregates
// inventory_items by status) rather than querying inventory_items directly.
const getAll = async (req, res, next) => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_discontinued', false);
    if (error) throw { status: 400, message: error.message };

    const { data: stockRows, error: stockError } = await supabase
      .from('product_stock_summary')
      .select('product_id, available_quantity, average_current_selling_price')
      .gt('available_quantity', 0);
    if (stockError) throw { status: 400, message: stockError.message };

    const stockByProduct = new Map(stockRows.map((row) => [row.product_id, row]));

    const data = products
      .filter((product) => stockByProduct.has(product.id))
      .map((product) => mapProduct(product, stockByProduct.get(product.id)));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// 404 (not just "no stock") for discontinued/sold-out ids too — a delisted
// product shouldn't resolve to a page that confirms it ever existed.
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: product, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('id', id)
      .eq('is_discontinued', false)
      .single();
    if (error || !product) throw { status: 404, message: 'Product not found' };

    const { data: stock, error: stockError } = await supabase
      .from('product_stock_summary')
      .select('product_id, available_quantity, average_current_selling_price')
      .eq('product_id', id)
      .maybeSingle();
    if (stockError) throw { status: 400, message: stockError.message };

    if (!stock || !stock.available_quantity || stock.available_quantity <= 0) {
      throw { status: 404, message: 'Product not found' };
    }

    res.json({ success: true, data: mapProduct(product, stock) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById };

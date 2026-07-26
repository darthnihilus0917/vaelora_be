const supabase = require('../config/supabaseClient');

// Matches the 3 statuses dashboardSummary/inventoryAging already recognize
// (case-insensitively) elsewhere in the reports layer.
const VALID_STATUSES = ['AVAILABLE', 'RESERVED', 'SOLD'];

const getMovements = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('inventory_item_id', id)
      .order('movement_date', { ascending: true });

    if (error) throw { status: 400, message: error.message };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getSale = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('sales')
      .select('*, marketplaces ( id, name )')
      .eq('inventory_item_id', id)
      .maybeSingle();

    if (error) throw { status: 400, message: error.message };

    res.json({ success: true, data: data || null });
  } catch (err) {
    next(err);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(String(status).toUpperCase())) {
      throw { status: 400, message: `status is required and must be one of ${VALID_STATUSES.join(', ')}` };
    }
    const normalizedStatus = String(status).toUpperCase();

    const { data: item, error: itemError } = await supabase
      .from('inventory_items')
      .select('id, status')
      .eq('id', id)
      .single();
    if (itemError || !item) throw { status: 404, message: 'Inventory item not found' };

    // A recorded sale is the source of truth for "this item is sold" --
    // letting a plain status PATCH move away from (or redundantly re-set)
    // that would desync it from the sales table and the reports that join
    // against it. Reconcile via the sale record instead.
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('id')
      .eq('inventory_item_id', id)
      .maybeSingle();
    if (saleError) throw { status: 400, message: saleError.message };
    if (sale) {
      throw { status: 409, message: 'This item has a recorded sale; status is locked. Update the sale record instead of changing status directly.' };
    }

    const { data, error } = await supabase
      .from('inventory_items')
      .update({ status: normalizedStatus })
      .eq('id', id)
      .select()
      .single();
    if (error) throw { status: 400, message: error.message };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMovements, getSale, updateStatus };

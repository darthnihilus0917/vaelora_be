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

    const { data, error } = await supabase
      .from('inventory_items')
      .update({ status: String(status).toUpperCase() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw { status: 400, message: error.message };
    if (!data) throw { status: 404, message: 'Inventory item not found' };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMovements, getSale, updateStatus };

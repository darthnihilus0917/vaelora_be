const supabase = require('../config/supabaseClient');

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

module.exports = { getMovements, getSale };

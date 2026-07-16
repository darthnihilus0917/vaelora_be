const supabase = require('../config/supabaseClient');
const {
  isCostKnown,
  daysBetween,
  computeSaleFigures,
  agingBucket,
  extractExternalReference,
} = require('../utils/profit');

const SALES_SELECT = `
  id, inventory_item_id, marketplace_id, selling_price, fees, shipping_cost,
  sold_date, remarks, created_at,
  inventory_items!inner (
    id, status, acquisition_price, purchase_date, current_selling_price,
    products!inner ( id, sku, brand, model_no, product_name, condition_label, is_discontinued )
  ),
  marketplaces ( id, name )
`;

async function fetchAllSalesWithJoins() {
  const { data, error } = await supabase.from('sales').select(SALES_SELECT);
  if (error) throw { status: 400, message: error.message };
  return data;
}

function monthLabel(dateStr) {
  return dateStr ? String(dateStr).slice(0, 7) : 'unknown';
}

// Flattens a joined sales row (sale + inventory_item + product + marketplace)
// into the flat shape every report endpoint below works with.
function flattenSale(row) {
  const item = row.inventory_items || {};
  const product = item.products || {};
  const figures = computeSaleFigures({
    selling_price: row.selling_price,
    fees: row.fees,
    shipping_cost: row.shipping_cost,
    acquisition_price: item.acquisition_price,
  });

  return {
    sale_id: row.id,
    sold_date: row.sold_date,
    external_reference: extractExternalReference(row.remarks),
    sku: product.sku || null,
    brand: product.brand || null,
    model_no: product.model_no || null,
    product_name: product.product_name || null,
    condition_label: product.condition_label || null,
    is_discontinued: !!product.is_discontinued,
    marketplace_id: row.marketplace_id,
    marketplace_name: row.marketplaces ? row.marketplaces.name : null,
    selling_price: Number(row.selling_price) || 0,
    acquisition_cost: figures.costKnown ? Number(item.acquisition_price) : null,
    fees: Number(row.fees) || 0,
    shipping: Number(row.shipping_cost) || 0,
    gross_profit: figures.grossProfit,
    net_profit: figures.netProfit,
    roi: figures.roi,
    days_held: daysBetween(item.purchase_date, row.sold_date),
    inventory_status: item.status || null,
    cost_known: figures.costKnown,
    is_historical_import: !figures.costKnown,
  };
}

const dashboardSummary = async (req, res, next) => {
  try {
    const [productsCountRes, itemsRes, salesRows] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase
        .from('inventory_items')
        .select('id, status, acquisition_price, current_selling_price, purchase_date'),
      fetchAllSalesWithJoins(),
    ]);

    if (productsCountRes.error) throw { status: 400, message: productsCountRes.error.message };
    if (itemsRes.error) throw { status: 400, message: itemsRes.error.message };

    const items = itemsRes.data;
    const sales = salesRows.map(flattenSale);

    const inventoryByStatus = {};
    items.forEach((i) => {
      inventoryByStatus[i.status] = (inventoryByStatus[i.status] || 0) + 1;
    });

    // Only "Available"/"SOLD" exist today; other statuses (e.g. Reserved) fall
    // out naturally once they appear, since we group by whatever value is present.
    const availableCount = inventoryByStatus['Available'] || 0;
    const reservedCount = inventoryByStatus['Reserved'] || 0;
    const soldCount = inventoryByStatus['SOLD'] || 0;

    const activeItems = items.filter((i) => i.status !== 'SOLD');
    const totalInventoryCost = activeItems.reduce(
      (sum, i) => (isCostKnown(i.acquisition_price) ? sum + Number(i.acquisition_price) : sum),
      0
    );
    const potentialRevenue = activeItems.reduce(
      (sum, i) => sum + (Number(i.current_selling_price) || 0),
      0
    );

    const knownCostSales = sales.filter((s) => s.cost_known);
    const grossProfit = knownCostSales.reduce((sum, s) => sum + s.gross_profit, 0);
    const netProfit = knownCostSales.reduce((sum, s) => sum + s.net_profit, 0);
    const avgProfitPerSale = knownCostSales.length ? netProfit / knownCostSales.length : null;

    const daysToSell = sales.map((s) => s.days_held).filter((d) => d !== null);
    const avgDaysToSell = daysToSell.length
      ? daysToSell.reduce((a, b) => a + b, 0) / daysToSell.length
      : null;

    const monthlyMap = new Map();
    sales.forEach((s) => {
      const label = monthLabel(s.sold_date);
      if (!monthlyMap.has(label)) monthlyMap.set(label, { month: label, revenue: 0, netProfit: 0 });
      const bucket = monthlyMap.get(label);
      bucket.revenue += s.selling_price;
      if (s.cost_known) bucket.netProfit += s.net_profit;
    });
    const monthlySales = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    const recentSales = [...sales]
      .sort((a, b) => new Date(b.sold_date) - new Date(a.sold_date))
      .slice(0, 5);

    const productMap = new Map();
    sales.forEach((s) => {
      const key = s.sku || `${s.brand}-${s.model_no}`;
      if (!productMap.has(key)) {
        productMap.set(key, {
          sku: s.sku,
          brand: s.brand,
          model_no: s.model_no,
          product_name: s.product_name,
          units_sold: 0,
          revenue: 0,
          net_profit: 0,
        });
      }
      const p = productMap.get(key);
      p.units_sold += 1;
      p.revenue += s.selling_price;
      if (s.cost_known) p.net_profit += s.net_profit;
    });
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        total_products: productsCountRes.count,
        available_inventory: availableCount,
        reserved_inventory: reservedCount,
        sold_inventory: soldCount,
        total_inventory_cost: totalInventoryCost,
        potential_revenue: potentialRevenue,
        total_sales: sales.length,
        gross_profit: grossProfit,
        net_profit: netProfit,
        avg_profit_per_sale: avgProfitPerSale,
        avg_days_to_sell: avgDaysToSell,
        monthly_sales: monthlySales,
        inventory_by_status: Object.entries(inventoryByStatus).map(([status, count]) => ({ status, count })),
        recent_sales: recentSales,
        top_products: topProducts,
      },
    });
  } catch (err) {
    next(err);
  }
};

const marketSales = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    let rows = (await fetchAllSalesWithJoins()).map(flattenSale);

    const { search, dateFrom, dateTo, marketplaceId, brand, condition_label, is_discontinued, profitability, costKnown } =
      req.query;

    if (dateFrom) rows = rows.filter((r) => r.sold_date >= dateFrom);
    if (dateTo) rows = rows.filter((r) => r.sold_date <= dateTo);
    if (marketplaceId) rows = rows.filter((r) => String(r.marketplace_id) === String(marketplaceId));
    if (brand) rows = rows.filter((r) => (r.brand || '').toLowerCase() === brand.toLowerCase());
    if (condition_label)
      rows = rows.filter((r) => (r.condition_label || '').toLowerCase() === condition_label.toLowerCase());
    if (is_discontinued !== undefined)
      rows = rows.filter((r) => r.is_discontinued === (is_discontinued === 'true'));
    if (costKnown !== undefined) rows = rows.filter((r) => r.cost_known === (costKnown === 'true'));
    if (profitability)
      rows = rows.filter((r) => {
        if (!r.cost_known) return false;
        return profitability === 'profitable' ? r.net_profit > 0 : r.net_profit <= 0;
      });
    if (search) {
      const term = search.toLowerCase();
      rows = rows.filter((r) =>
        [r.external_reference, r.sku, r.brand, r.model_no, r.product_name].some((v) =>
          (v || '').toLowerCase().includes(term)
        )
      );
    }

    rows.sort((a, b) => new Date(b.sold_date) - new Date(a.sold_date));

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageRows = rows.slice((page - 1) * limit, page * limit).map((r) => ({
      id: r.sale_id,
      sold_date: r.sold_date,
      external_reference: r.external_reference,
      sku: r.sku,
      brand: r.brand,
      model_no: r.model_no,
      product_name: r.product_name,
      condition_label: r.condition_label,
      marketplace_name: r.marketplace_name,
      selling_price: r.selling_price,
      acquisition_cost: r.acquisition_cost,
      fees: r.fees,
      shipping: r.shipping,
      gross_profit: r.gross_profit,
      net_profit: r.net_profit,
      roi: r.roi,
      days_held: r.days_held,
      inventory_status: r.inventory_status,
      is_historical_import: r.is_historical_import,
    }));

    const known = rows.filter((r) => r.cost_known);
    const grossRevenue = rows.reduce((sum, r) => sum + r.selling_price, 0);
    const totalFees = rows.reduce((sum, r) => sum + r.fees, 0);
    const totalShipping = rows.reduce((sum, r) => sum + r.shipping, 0);
    const grossProfit = known.reduce((sum, r) => sum + r.gross_profit, 0);
    const netProfit = known.reduce((sum, r) => sum + r.net_profit, 0);
    const roiKnown = known.filter((r) => r.roi !== null);

    res.json({
      success: true,
      data: {
        items: pageRows,
        page,
        limit,
        total,
        totalPages,
        summary: {
          number_of_sales: total,
          gross_revenue: grossRevenue,
          total_fees: totalFees,
          total_shipping: totalShipping,
          gross_profit: grossProfit,
          net_profit: netProfit,
          avg_selling_price: total ? grossRevenue / total : 0,
          avg_net_profit: known.length ? netProfit / known.length : null,
          avg_roi: roiKnown.length ? roiKnown.reduce((sum, r) => sum + r.roi, 0) / roiKnown.length : null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

const inventoryAging = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('inventory_items')
      .select(
        `id, status, acquisition_price, current_selling_price, purchase_date,
         products!inner ( sku, brand, model_no, product_name )`
      )
      .eq('status', 'Available');

    if (error) throw { status: 400, message: error.message };

    const today = new Date();
    const buckets = { new: 0, normal: 0, watch: 0, slow: 0, critical: 0 };
    let capitalLocked = 0;

    const items = data.map((item) => {
      const product = item.products || {};
      const daysHeld = daysBetween(item.purchase_date, today);
      const bucket = agingBucket(daysHeld);
      if (bucket !== 'unknown') buckets[bucket] += 1;

      const costKnown = isCostKnown(item.acquisition_price);
      if (costKnown && daysHeld !== null && daysHeld >= 91) {
        capitalLocked += Number(item.acquisition_price);
      }

      return {
        sku: product.sku || null,
        brand: product.brand || null,
        model_no: product.model_no || null,
        product_name: product.product_name || null,
        purchase_date: item.purchase_date,
        days_held: daysHeld,
        acquisition_cost: costKnown ? Number(item.acquisition_price) : null,
        current_price: Number(item.current_selling_price) || 0,
        potential_margin: costKnown ? Number(item.current_selling_price) - Number(item.acquisition_price) : null,
        status: bucket,
      };
    });

    res.json({ success: true, data: { items, buckets, capital_locked: capitalLocked } });
  } catch (err) {
    next(err);
  }
};

const profitReport = async (req, res, next) => {
  try {
    const sales = (await fetchAllSalesWithJoins()).map(flattenSale);
    const known = sales.filter((s) => s.cost_known);

    const byMonthMap = new Map();
    sales.forEach((s) => {
      const label = monthLabel(s.sold_date);
      if (!byMonthMap.has(label)) byMonthMap.set(label, { label, revenue: 0, gross_profit: 0, net_profit: 0 });
      const b = byMonthMap.get(label);
      b.revenue += s.selling_price;
      if (s.cost_known) {
        b.gross_profit += s.gross_profit;
        b.net_profit += s.net_profit;
      }
    });
    const byMonth = Array.from(byMonthMap.values()).sort((a, b) => a.label.localeCompare(b.label));

    const byMarketMap = new Map();
    known.forEach((s) => {
      const label = s.marketplace_name || 'Unknown';
      byMarketMap.set(label, (byMarketMap.get(label) || 0) + s.net_profit);
    });
    const byMarketplace = Array.from(byMarketMap.entries()).map(([label, net_profit]) => ({ label, net_profit }));

    const rankedByProfit = [...known].sort((a, b) => b.net_profit - a.net_profit);
    const toRankedEntry = (s) => ({
      id: s.sale_id,
      product_name: s.product_name,
      model_no: s.model_no,
      brand: s.brand,
      net_profit: s.net_profit,
    });
    const mostProfitable = rankedByProfit.slice(0, 5).map(toRankedEntry);
    const lowestMargin = rankedByProfit.slice(-5).reverse().map(toRankedEntry);

    const byBrandMap = new Map();
    known.forEach((s) => {
      const label = s.brand || 'Unknown';
      byBrandMap.set(label, (byBrandMap.get(label) || 0) + s.net_profit);
    });
    const byBrand = Array.from(byBrandMap.entries()).map(([label, net_profit]) => ({ id: label, label, net_profit }));

    const byModelMap = new Map();
    known.forEach((s) => {
      const id = s.model_no || `${s.brand}-unknown`;
      const label = [s.brand, s.model_no].filter(Boolean).join(' ') || 'Unknown';
      if (!byModelMap.has(id)) byModelMap.set(id, { id, label, net_profit: 0 });
      byModelMap.get(id).net_profit += s.net_profit;
    });
    const byModel = Array.from(byModelMap.values());

    res.json({
      success: true,
      data: {
        by_month: byMonth,
        by_marketplace: byMarketplace,
        most_profitable: mostProfitable,
        lowest_margin: lowestMargin,
        by_brand: byBrand,
        by_model: byModel,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { dashboardSummary, marketSales, inventoryAging, profitReport };

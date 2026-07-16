// Shared cost/profit helpers for reporting endpoints.
//
// Several inventory_items rows have acquisition_price = 0 because the cost
// was never recorded (historical marketplace imports), not because the item
// was free. Every profit/margin figure must treat that as "unknown", not $0,
// otherwise historical imports look artificially profitable.

function isCostKnown(acquisitionPrice) {
  return acquisitionPrice !== null && acquisitionPrice !== undefined && Number(acquisitionPrice) > 0;
}

function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.max(0, Math.round((to - from) / 86400000));
}

// Computes gross/net profit + ROI for a single sale. Returns nulls (not 0)
// when acquisition cost is unknown so callers never silently treat it as free.
function computeSaleFigures({ selling_price, fees, shipping_cost, acquisition_price }) {
  const costKnown = isCostKnown(acquisition_price);
  const sellingPrice = Number(selling_price) || 0;
  const feesNum = Number(fees) || 0;
  const shippingNum = Number(shipping_cost) || 0;

  if (!costKnown) {
    return { costKnown, grossProfit: null, netProfit: null, roi: null };
  }

  const cost = Number(acquisition_price);
  const grossProfit = sellingPrice - cost;
  const netProfit = grossProfit - feesNum - shippingNum;
  const roi = cost > 0 ? (netProfit / cost) * 100 : null;

  return { costKnown, grossProfit, netProfit, roi };
}

// Aging buckets per days-in-inventory, only meaningful when daysHeld is known.
function agingBucket(daysHeld) {
  if (daysHeld === null || daysHeld === undefined) return 'unknown';
  if (daysHeld <= 30) return 'new';
  if (daysHeld <= 60) return 'normal';
  if (daysHeld <= 90) return 'watch';
  if (daysHeld <= 120) return 'slow';
  return 'critical';
}

// Legacy imported sales carry a leading reference code in `remarks`
// (e.g. "VAELORA-FBM-005; historical Facebook Marketplace sold listing...").
// Organic, non-imported sales won't match this shape, so the result is nullable.
function extractExternalReference(remarks) {
  if (!remarks) return null;
  const match = String(remarks).match(/^([A-Z0-9][A-Z0-9-]{2,})(?:;|$)/);
  return match ? match[1] : null;
}

module.exports = {
  isCostKnown,
  daysBetween,
  computeSaleFigures,
  agingBucket,
  extractExternalReference,
};

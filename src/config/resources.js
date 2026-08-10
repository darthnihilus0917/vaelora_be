// Maps Supabase tables/views to API paths. `writable: false` resources
// (reports/aggregates) only get a GET list route.
//
// `fields` whitelists which body keys create/update will actually write to
// the table (everything else in req.body is silently dropped). Required
// because the DB client is service_role, which bypasses RLS -- without a
// whitelist here, POST/PUT could set any column that exists on the table
// (id, created_at, etc), not just the ones the API means to expose. Keep
// this in sync with the table's real columns (id/created_at/other
// server-managed timestamps are intentionally excluded).
module.exports = [
  { table: 'categories', path: 'categories', writable: true, fields: ['name', 'description'] },
  {
    table: 'suppliers',
    path: 'suppliers',
    writable: true,
    fields: ['name', 'contact_person', 'phone', 'email', 'notes', 'address'],
  },
  { table: 'marketplaces', path: 'marketplaces', writable: true, fields: ['name'] },
  // 'products' is intentionally not listed here — it has its own controller/
  // routes (productsController.js / productsRoutes.js) to support image
  // uploads, mounted explicitly in app.js like 'brands'.
  // softDelete: DELETE sets is_active = false instead of removing the row;
  // GET list hides inactive rows unless ?includeInactive=true is passed.
  {
    table: 'inventory_items',
    path: 'inventory-items',
    writable: true,
    softDelete: true,
    fields: [
      'product_id', 'supplier_id', 'serial_no', 'acquisition_price',
      'target_selling_price', 'current_selling_price', 'market_price_low',
      'market_price_high', 'status', 'purchase_date', 'storage_location',
      'notes', 'is_active',
    ],
  },
  {
    table: 'stock_movements',
    path: 'stock-movements',
    writable: true,
    fields: ['inventory_item_id', 'movement_type', 'movement_date', 'quantity', 'remarks'],
  },
  {
    table: 'sales',
    path: 'sales',
    writable: true,
    fields: [
      'inventory_item_id', 'marketplace_id', 'buyer_name', 'selling_price',
      'fees', 'shipping_cost', 'net_profit', 'sold_date', 'payment_method',
      'remarks', 'cash_account_id', 'is_vat_inclusive',
    ],
  },
  {
    table: 'marketplace_sales_import',
    path: 'marketplace-sales-import',
    writable: true,
    fields: [
      'external_ref', 'category', 'brand', 'model', 'item_name', 'condition',
      'market_release', 'quantity', 'unit_price', 'currency', 'status',
      'sales_channel', 'source_image', 'notes', 'sold_at',
    ],
  },
  {
    table: 'vaelora_sales_reconcile_stage',
    path: 'sales-reconcile-stage',
    writable: true,
    fields: [
      'external_ref', 'sku', 'brand', 'model_no', 'product_name',
      'movement_type', 'condition_label', 'description', 'is_discontinued',
      'selling_price', 'quantity', 'source_image',
    ],
  },

  { table: 'inventory_data_quality_report', path: 'inventory-data-quality-report', writable: false },
  { table: 'stock_movement_ledger', path: 'stock-movement-ledger', writable: false },
  { table: 'inventory_item_details', path: 'inventory-item-details', writable: false },
  { table: 'inventory_aging_report', path: 'inventory-aging-report', writable: false },
  { table: 'inventory_valuation_summary', path: 'inventory-valuation-summary', writable: false },
  { table: 'product_stock_summary', path: 'product-stock-summary', writable: false },
];

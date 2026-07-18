// Maps Supabase tables/views to API paths. `writable: false` resources
// (reports/aggregates) only get a GET list route.
module.exports = [
  { table: 'categories', path: 'categories', writable: true },
  { table: 'suppliers', path: 'suppliers', writable: true },
  { table: 'marketplaces', path: 'marketplaces', writable: true },
  { table: 'products', path: 'products', writable: true },
  // softDelete: DELETE sets is_active = false instead of removing the row;
  // GET list hides inactive rows unless ?includeInactive=true is passed.
  { table: 'inventory_items', path: 'inventory-items', writable: true, softDelete: true },
  { table: 'stock_movements', path: 'stock-movements', writable: true },
  { table: 'sales', path: 'sales', writable: true },
  { table: 'marketplace_sales_import', path: 'marketplace-sales-import', writable: true },
  { table: 'vaelora_sales_reconcile_stage', path: 'sales-reconcile-stage', writable: true },

  { table: 'inventory_data_quality_report', path: 'inventory-data-quality-report', writable: false },
  { table: 'stock_movement_ledger', path: 'stock-movement-ledger', writable: false },
  { table: 'inventory_item_details', path: 'inventory-item-details', writable: false },
  { table: 'inventory_aging_report', path: 'inventory-aging-report', writable: false },
  { table: 'inventory_valuation_summary', path: 'inventory-valuation-summary', writable: false },
  { table: 'product_stock_summary', path: 'product-stock-summary', writable: false },
];

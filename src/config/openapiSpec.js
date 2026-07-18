const resources = require('./resources');

const SuccessEnvelope = (dataSchema) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
  },
});

const ErrorEnvelope = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: { type: 'string', example: 'Something went wrong' },
  },
};

const errorResponses = {
  400: { description: 'Bad request', content: { 'application/json': { schema: ErrorEnvelope } } },
  404: { description: 'Not found', content: { 'application/json': { schema: ErrorEnvelope } } },
};

const genericRecord = { type: 'object', additionalProperties: true };

const paginatedEnvelope = (itemSchema) => ({
  type: 'object',
  properties: {
    items: { type: 'array', items: itemSchema },
    page: { type: 'integer', example: 1 },
    limit: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 42 },
    totalPages: { type: 'integer', example: 3 },
  },
});

// Pagination/sorting is opt-in on every generic list endpoint: only kicks in
// once page, limit, or sortBy is sent. Omitting all three keeps returning the
// plain array shape, so existing callers (e.g. dropdown lookups) are unaffected.
const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Enables pagination when set (along with limit/sortBy)' },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
  { name: 'sortBy', in: 'query', schema: { type: 'string' }, description: 'Any column on the table/view' },
  { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
];

// One CRUD resource entry becomes 1-5 OpenAPI operations, mirroring exactly
// what buildResourceRouter (src/routes/resourceRoutes.js) wires up for it.
function buildResourcePaths({ table, path, writable, softDelete }) {
  const tag = path;
  const listPath = `/${path}`;
  const itemPath = `/${path}/{id}`;
  const paths = {};

  const listDescription = softDelete
    ? 'No query params -> plain array. Pass page/limit/sortBy to get { items, page, limit, total, totalPages } instead. Rows with is_active=false are hidden unless includeInactive=true is passed.'
    : 'No query params -> plain array. Pass page/limit/sortBy to get { items, page, limit, total, totalPages } instead.';

  paths[listPath] = {
    get: {
      tags: [tag],
      summary: `List all ${table}`,
      description: listDescription,
      parameters: softDelete
        ? [...paginationParams, { name: 'includeInactive', in: 'query', schema: { type: 'boolean', default: false }, description: 'Include soft-deleted (is_active=false) rows' }]
        : paginationParams,
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: SuccessEnvelope({
                oneOf: [{ type: 'array', items: genericRecord }, paginatedEnvelope(genericRecord)],
              }),
            },
          },
        },
      },
    },
  };

  if (!writable) return paths;

  paths[listPath].post = {
    tags: [tag],
    summary: `Create a ${table} record`,
    requestBody: {
      required: true,
      content: { 'application/json': { schema: genericRecord } },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } },
      400: errorResponses[400],
    },
  };

  paths[itemPath] = {
    get: {
      tags: [tag],
      summary: `Get a single ${table} record by id`,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } },
        404: errorResponses[404],
      },
    },
    put: {
      tags: [tag],
      summary: `Update a ${table} record by id`,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: genericRecord } },
      },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } },
        400: errorResponses[400],
        404: errorResponses[404],
      },
    },
    delete: {
      tags: [tag],
      summary: softDelete ? `Soft-delete a ${table} record by id (sets is_active=false)` : `Delete a ${table} record by id`,
      description: softDelete ? 'Does not remove the row — sets is_active=false. List endpoint hides it afterward unless includeInactive=true.' : undefined,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: SuccessEnvelope(undefined) /* overwritten below */,
            },
          },
        },
        400: errorResponses[400],
      },
    },
  };
  // delete responds with a message, not data — patch that in directly.
  paths[itemPath].delete.responses[200].content['application/json'].schema = softDelete
    ? {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Record 1 deactivated in table' },
          data: genericRecord,
        },
      }
    : {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Record 1 deleted from table' },
        },
      };

  return paths;
}

const resourcePaths = resources.reduce((acc, r) => Object.assign(acc, buildResourcePaths(r)), {});

const reportsPaths = {
  '/reports/dashboard-summary': {
    get: {
      tags: ['reports'],
      summary: 'Dashboard KPI summary (inventory, sales, profit)',
      description:
        'All profit/margin figures are null wherever acquisition cost is unknown (missing or zero) rather than being computed as if the item were free.',
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } } },
    },
  },
  '/reports/market-sales': {
    get: {
      tags: ['reports'],
      summary: 'Paginated, filterable list of sales with per-row profit figures',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Matches sku, brand, model_no, product_name, external_reference' },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'marketplaceId', in: 'query', schema: { type: 'integer' } },
        { name: 'brand', in: 'query', schema: { type: 'string' } },
        { name: 'condition_label', in: 'query', schema: { type: 'string' } },
        { name: 'is_discontinued', in: 'query', schema: { type: 'boolean' } },
        { name: 'profitability', in: 'query', schema: { type: 'string', enum: ['profitable', 'loss'] } },
        { name: 'costKnown', in: 'query', schema: { type: 'boolean' } },
        { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['sold_date', 'selling_price', 'acquisition_cost', 'fees', 'shipping', 'gross_profit', 'net_profit', 'roi', 'days_held', 'brand', 'sku', 'model_no', 'product_name', 'marketplace_name'] }, description: 'Defaults to sold_date' },
        { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
      ],
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } } },
    },
  },
  '/reports/inventory-aging': {
    get: {
      tags: ['reports'],
      summary: 'Per-item aging breakdown for available inventory, bucketed by days held',
      description: 'buckets/capital_locked always reflect the full available-inventory set, independent of pagination on items. No page/limit -> items is the full unpaginated list.',
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Enables pagination when set (along with limit)' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['days_held', 'acquisition_cost', 'current_price', 'potential_margin', 'brand', 'sku', 'model_no', 'product_name', 'purchase_date'] }, description: 'Defaults to days_held' },
        { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
      ],
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } } },
    },
  },
  '/reports/profit': {
    get: {
      tags: ['reports'],
      summary: 'Profit breakdowns by month, marketplace, brand, and model',
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } } },
    },
  },
};

const inventoryItemExtraPaths = {
  '/inventory-items/{id}/movements': {
    get: {
      tags: ['inventory-items'],
      summary: 'Stock movement history for a single inventory item',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope({ type: 'array', items: genericRecord }) } } } },
    },
  },
  '/inventory-items/{id}/sale': {
    get: {
      tags: ['inventory-items'],
      summary: 'The sale record for an inventory item, or null if it has not sold',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: SuccessEnvelope({ ...genericRecord, nullable: true }) } },
        },
      },
    },
  },
};

const brandRecord = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    slug: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    is_active: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    product_count: { type: 'integer', description: 'Number of products linked via products.brand_id' },
  },
};

const brandsPaths = {
  '/brands': {
    get: {
      tags: ['brands'],
      summary: 'List brands',
      description: 'No page/limit/sortBy -> plain array. Pass any of them to get { items, page, limit, total, totalPages } instead.',
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Case-insensitive match on name' },
        { name: 'is_active', in: 'query', schema: { type: 'boolean' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'sortBy', in: 'query', schema: { type: 'string' }, description: 'Any brands column (product_count is computed, not sortable)' },
        { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
      ],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: SuccessEnvelope({ oneOf: [{ type: 'array', items: brandRecord }, paginatedEnvelope(brandRecord)] }),
            },
          },
        },
      },
    },
    post: {
      tags: ['brands'],
      summary: 'Create a brand',
      description: 'slug is auto-generated from name if omitted.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                slug: { type: 'string' },
                description: { type: 'string' },
                is_active: { type: 'boolean', default: true },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Created', content: { 'application/json': { schema: SuccessEnvelope(brandRecord) } } },
        400: errorResponses[400],
      },
    },
  },
  '/brands/{id}': {
    get: {
      tags: ['brands'],
      summary: 'Get a single brand by id',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(brandRecord) } } },
        404: errorResponses[404],
      },
    },
    put: {
      tags: ['brands'],
      summary: 'Full update of a brand',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                slug: { type: 'string' },
                description: { type: 'string' },
                is_active: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(brandRecord) } } },
        400: errorResponses[400],
        404: errorResponses[404],
      },
    },
    patch: {
      tags: ['brands'],
      summary: 'Partial update of a brand (e.g. toggling is_active)',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                slug: { type: 'string' },
                description: { type: 'string' },
                is_active: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(brandRecord) } } },
        400: errorResponses[400],
        404: errorResponses[404],
      },
    },
    delete: {
      tags: ['brands'],
      summary: 'Delete a brand',
      description: 'Fails with 409 if the brand still has products (products.brand_id is ON DELETE RESTRICT) — deactivate instead.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true }, message: { type: 'string', example: 'Record 1 deleted from brands' } },
              },
            },
          },
        },
        400: errorResponses[400],
        409: {
          description: 'Conflict — brand still has linked products',
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      },
    },
  },
};

// /health is mounted outside the /api prefix, so it needs its own server override.
const healthPath = {
  '/health': {
    servers: [{ url: '/' }],
    get: {
      tags: ['health'],
      summary: 'Liveness check',
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true }, message: { type: 'string', example: 'Server is up' } },
              },
            },
          },
        },
      },
    },
  },
};

const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Vaelora Backend API',
    version: '1.0.0',
    description:
      'Express + Supabase backend. Most resources are generic CRUD endpoints generated from src/config/resources.js; /reports/* and the /inventory-items/{id}/* sub-resources are hand-written.',
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'health' },
    { name: 'brands' },
    ...resources.map((r) => ({ name: r.path })),
    { name: 'reports' },
  ],
  paths: {
    ...healthPath,
    ...brandsPaths,
    ...resourcePaths,
    ...reportsPaths,
    ...inventoryItemExtraPaths,
  },
};

module.exports = openapiSpec;

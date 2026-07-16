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

// One CRUD resource entry becomes 1-5 OpenAPI operations, mirroring exactly
// what buildResourceRouter (src/routes/resourceRoutes.js) wires up for it.
function buildResourcePaths({ table, path, writable }) {
  const tag = path;
  const listPath = `/${path}`;
  const itemPath = `/${path}/{id}`;
  const paths = {};

  paths[listPath] = {
    get: {
      tags: [tag],
      summary: `List all ${table}`,
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: SuccessEnvelope({ type: 'array', items: genericRecord }) } },
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
      summary: `Delete a ${table} record by id`,
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
  paths[itemPath].delete.responses[200].content['application/json'].schema = {
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
      ],
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } } },
    },
  },
  '/reports/inventory-aging': {
    get: {
      tags: ['reports'],
      summary: 'Per-item aging breakdown for available inventory, bucketed by days held',
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
    ...resources.map((r) => ({ name: r.path })),
    { name: 'reports' },
  ],
  paths: {
    ...healthPath,
    ...resourcePaths,
    ...reportsPaths,
    ...inventoryItemExtraPaths,
  },
};

module.exports = openapiSpec;

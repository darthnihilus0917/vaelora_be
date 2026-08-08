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
  '/inventory-items/{id}/status': {
    patch: {
      tags: ['inventory-items'],
      summary: 'Change an inventory item\'s status',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['AVAILABLE', 'RESERVED', 'SOLD'] } } },
          },
        },
      },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } },
        400: errorResponses[400],
        404: errorResponses[404],
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

const productImageRecord = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    product_id: { type: 'integer' },
    url: { type: 'string', format: 'uri' },
    is_default: { type: 'boolean' },
    sort_order: { type: 'integer' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

const productRecord = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    sku: { type: 'string' },
    product_name: { type: 'string' },
    brand_id: { type: 'integer', nullable: true },
    category_id: { type: 'integer', nullable: true },
    model_no: { type: 'string', nullable: true },
    condition_label: { type: 'string', nullable: true },
    is_discontinued: { type: 'boolean' },
    product_images: { type: 'array', items: productImageRecord },
  },
};

const productsPaths = {
  '/products': {
    get: {
      tags: ['products'],
      summary: 'List products (each includes its product_images)',
      description: 'No page/limit/sortBy -> plain array. Pass any of them to get { items, page, limit, total, totalPages } instead.',
      parameters: paginationParams,
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: SuccessEnvelope({ oneOf: [{ type: 'array', items: productRecord }, paginatedEnvelope(productRecord)] }),
            },
          },
        },
      },
    },
    post: {
      tags: ['products'],
      summary: 'Create a product (admin/superadmin only)',
      requestBody: { required: true, content: { 'application/json': { schema: genericRecord } } },
      responses: {
        201: { description: 'Created', content: { 'application/json': { schema: SuccessEnvelope(productRecord) } } },
        400: errorResponses[400],
        403: { description: 'Requires admin or superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/products/{id}': {
    get: {
      tags: ['products'],
      summary: 'Get a single product by id (includes its product_images)',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(productRecord) } } },
        404: errorResponses[404],
      },
    },
    put: {
      tags: ['products'],
      summary: 'Update a product (admin/superadmin only)',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: { required: true, content: { 'application/json': { schema: genericRecord } } },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(productRecord) } } },
        400: errorResponses[400],
        403: { description: 'Requires admin or superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
        404: errorResponses[404],
      },
    },
    delete: {
      tags: ['products'],
      summary: 'Delete a product (admin/superadmin only)',
      description: 'Also deletes all of its images from R2 (product_images rows cascade-delete in Postgres).',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string' } } } } },
        },
        400: errorResponses[400],
        403: { description: 'Requires admin or superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/products/{id}/images': {
    get: {
      tags: ['products'],
      summary: 'List a product\'s images, ordered by sort_order',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope({ type: 'array', items: productImageRecord }) } } },
      },
    },
    post: {
      tags: ['products'],
      summary: 'Upload one or more images for a product (admin/superadmin only)',
      description:
        'Images are uploaded to Cloudflare R2. Field name must be "images" (up to 10 files, 5MB each, jpeg/png/webp/gif only). '
        + 'Optional "defaultIndex" form field (0-based, within this batch) marks one of the uploaded files as the default image. '
        + 'If the product has no images yet and defaultIndex is omitted, the first uploaded file becomes the default automatically.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['images'],
              properties: {
                images: { type: 'array', items: { type: 'string', format: 'binary' } },
                defaultIndex: { type: 'integer', description: '0-based index within the uploaded "images" array' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Created', content: { 'application/json': { schema: SuccessEnvelope({ type: 'array', items: productImageRecord }) } } },
        400: errorResponses[400],
        403: { description: 'Requires admin or superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
        404: { description: 'Product not found', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/products/{id}/images/{imageId}/default': {
    patch: {
      tags: ['products'],
      summary: 'Set an existing image as the product\'s default image (admin/superadmin only)',
      description: 'Clears is_default on any other image for the same product first, so at most one default ever exists per product.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'imageId', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(productImageRecord) } } },
        403: { description: 'Requires admin or superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
        404: { description: 'Image not found for this product', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/products/{id}/images/{imageId}': {
    delete: {
      tags: ['products'],
      summary: 'Delete a product image (admin/superadmin only)',
      description: 'Removes the object from R2 and the DB row. If the deleted image was the default, the next image (by sort_order) is promoted to default.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'imageId', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string' } } } } },
        },
        403: { description: 'Requires admin or superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
        404: { description: 'Image not found for this product', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
};

const sessionSchema = {
  type: 'object',
  properties: {
    access_token: { type: 'string' },
    refresh_token: { type: 'string' },
    expires_at: { type: 'integer' },
    token_type: { type: 'string', example: 'bearer' },
  },
};

const profileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    full_name: { type: 'string', nullable: true },
    role: { type: 'string', description: 'One of the role names returned by GET /roles', example: 'staff' },
    is_active: { type: 'boolean' },
  },
};

const authPaths = {
  '/auth/register': {
    post: {
      tags: ['auth'],
      summary: 'Register the very first user (self-registration closes after that)',
      description: '403 once any user_profiles row already exists. The first-ever account is auto-promoted to superadmin by a DB trigger.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' }, full_name: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        201: { description: 'Created', content: { 'application/json': { schema: SuccessEnvelope({ type: 'object', properties: { session: sessionSchema, profile: profileSchema } }) } } },
        400: errorResponses[400],
        403: { description: 'Registration is closed', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/auth/invite': {
    post: {
      tags: ['auth'],
      summary: 'Invite a new user by email (admin/superadmin only)',
      description: 'Sends a Supabase invite email. Admins may only assign staff/viewer; only superadmin may assign admin/superadmin.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'role'],
              properties: {
                email: { type: 'string', format: 'email' },
                full_name: { type: 'string' },
                role: { type: 'string', description: 'One of the role names returned by GET /roles', example: 'staff' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Created', content: { 'application/json': { schema: SuccessEnvelope(genericRecord) } } },
        400: errorResponses[400],
        403: { description: 'Cannot assign that role', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/auth/login': {
    post: {
      tags: ['auth'],
      summary: 'Email/password sign-in',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } },
          },
        },
      },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope({ type: 'object', properties: { session: sessionSchema, profile: profileSchema } }) } } },
        401: { description: 'Invalid credentials', content: { 'application/json': { schema: ErrorEnvelope } } },
        403: { description: 'Account deactivated', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['auth'],
      summary: 'Invalidate the current session',
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string' } } } } } },
        401: { description: 'Not authenticated', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['auth'],
      summary: 'Rotate an access token using a refresh token',
      security: [],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['refresh_token'], properties: { refresh_token: { type: 'string' } } } } },
      },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope({ type: 'object', properties: { session: sessionSchema } }) } } },
        401: { description: 'Invalid or expired refresh token', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/auth/me': {
    get: {
      tags: ['auth'],
      summary: "Current user's profile",
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(profileSchema) } } },
        401: { description: 'Not authenticated', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
};

const userRecord = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    full_name: { type: 'string', nullable: true },
    role: { type: 'string', description: 'One of the role names returned by GET /roles', example: 'staff' },
    is_active: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

const usersPaths = {
  '/users': {
    get: {
      tags: ['users'],
      summary: 'List all user profiles (superadmin only)',
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope({ type: 'array', items: userRecord }) } } },
        403: { description: 'Requires superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/users/{id}/role': {
    patch: {
      tags: ['users'],
      summary: "Change a user's role (superadmin only)",
      description: 'Logs a ROLE_CHANGE entry to auth_audit_log. Cannot target your own account.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['role'], properties: { role: { type: 'string', description: 'One of the role names returned by GET /roles' } } } } },
      },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(userRecord) } } },
        400: errorResponses[400],
        403: { description: 'Requires superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
        404: errorResponses[404],
      },
    },
  },
  '/users/{id}/deactivate': {
    patch: {
      tags: ['users'],
      summary: 'Deactivate a user (superadmin only)',
      description: 'Logs an ACCOUNT_DEACTIVATED entry to auth_audit_log. Cannot target your own account.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(userRecord) } } },
        400: errorResponses[400],
        403: { description: 'Requires superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
        404: errorResponses[404],
      },
    },
  },
  '/users/{id}/activate': {
    patch: {
      tags: ['users'],
      summary: 'Reactivate a user (superadmin only)',
      description: 'Logs an ACCOUNT_ACTIVATED entry to auth_audit_log.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(userRecord) } } },
        403: { description: 'Requires superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
        404: errorResponses[404],
      },
    },
  },
};

const roleRecord = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', example: 'staff' },
    description: { type: 'string', nullable: true },
    is_system: { type: 'boolean', description: 'True for the 4 built-in roles (superadmin/admin/staff/viewer); these cannot be renamed or deleted.' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

const rolesPaths = {
  '/roles': {
    get: {
      tags: ['roles'],
      summary: 'List all roles',
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope({ type: 'array', items: roleRecord }) } } },
        401: { description: 'Not authenticated', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
    post: {
      tags: ['roles'],
      summary: 'Create a custom role (superadmin only)',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: 'Lowercase letters, numbers, underscores; must start with a letter', example: 'manager' },
                description: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Created', content: { 'application/json': { schema: SuccessEnvelope(roleRecord) } } },
        400: errorResponses[400],
        403: { description: 'Requires superadmin', content: { 'application/json': { schema: ErrorEnvelope } } },
        409: { description: 'Role name already exists', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
  },
  '/roles/{name}': {
    get: {
      tags: ['roles'],
      summary: 'Get a single role by name',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(roleRecord) } } },
        404: errorResponses[404],
      },
    },
    patch: {
      tags: ['roles'],
      summary: 'Update a role (superadmin only)',
      description: 'System roles (is_system=true) cannot be renamed, only their description edited.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: false,
        content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } } },
      },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: SuccessEnvelope(roleRecord) } } },
        400: errorResponses[400],
        403: { description: 'Requires superadmin, or attempted to rename a system role', content: { 'application/json': { schema: ErrorEnvelope } } },
        404: errorResponses[404],
        409: { description: 'Role name already exists', content: { 'application/json': { schema: ErrorEnvelope } } },
      },
    },
    delete: {
      tags: ['roles'],
      summary: 'Delete a custom role (superadmin only)',
      description: 'System roles cannot be deleted. Roles still assigned to a user_profiles row cannot be deleted (409).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true }, message: { type: 'string' } } } } },
        },
        403: { description: 'Requires superadmin, or attempted to delete a system role', content: { 'application/json': { schema: ErrorEnvelope } } },
        404: errorResponses[404],
        409: { description: 'Role still assigned to a user', content: { 'application/json': { schema: ErrorEnvelope } } },
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
      security: [],
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
  // Every route requires a Bearer token now except the few marked
  // `security: []` below (register/login/refresh/health). Previously most
  // of this API (all generic resources, brands, reports, inventory-item
  // sub-resources) had no auth at all — this was a real gap, not just docs.
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Supabase access_token from /auth/login, /auth/register, or /auth/refresh' },
    },
  },
  tags: [
    { name: 'health' },
    { name: 'auth' },
    { name: 'users' },
    { name: 'roles' },
    { name: 'brands' },
    { name: 'products' },
    ...resources.map((r) => ({ name: r.path })),
    { name: 'reports' },
  ],
  paths: {
    ...healthPath,
    ...authPaths,
    ...usersPaths,
    ...rolesPaths,
    ...brandsPaths,
    ...productsPaths,
    ...resourcePaths,
    ...reportsPaths,
    ...inventoryItemExtraPaths,
  },
};

module.exports = openapiSpec;

# Public Storefront — Backend Handover

## Context

The frontend now serves two separate apps from one deploy:

- **Admin** — everything under `/admin/*`, unchanged, still fully authenticated. This is the existing inventory/sales system this handover does **not** touch.
- **Public storefront** — everything else (`/`, `/watches`, `/watches/:id`, `/fragrance`, `/fragrance/:id`) — a new customer-facing catalog site, built from the mockups in `mockup/`.

**The storefront currently cannot load any product data.** It calls the same endpoints the admin uses (`GET /products`, `GET /categories`, `GET /product-stock-summary`), and every one of them requires an authenticated request. A real anonymous visitor gets a `401` and sees a "this catalog isn't publicly available yet" message — a deliberate, graceful fallback (see `src/storefront/components/CatalogStatus.jsx`), not a crash. But the storefront is not actually usable by a customer until this is addressed.

## Hard constraint: do not modify any protected endpoint

**No change to authentication or behavior on any existing endpoint.** The admin app depends on all of these staying exactly as they are — protected, and returning their current shape:

| Endpoint | Used by |
|---|---|
| `GET /products`, `GET/PUT/PATCH/DELETE /products/:id` | Admin Products page, and currently (incorrectly, see below) the storefront |
| `GET /categories` | Admin Categories page, and currently the storefront |
| `GET /product-stock-summary` | Admin Product Stock Summary page, and currently the storefront |
| `GET/POST /products/:id/images`, `PATCH/DELETE .../images/:imageId` | Admin product image upload (see `docs/product-image-upload-handover.md`) |
| Every other documented endpoint (`/inventory-items`, `/sales`, `/users`, `/roles`, etc.) | Admin only — the storefront never calls these |

Nothing here should be made public, have its auth requirement loosened, or have its response shape changed. If anything below sounds like it could be done by "just removing the auth check" from one of these — don't; see the security note below for why.

## What needs to be created: new, separate public endpoints

**Yes, new endpoints need to be created.** Reusing the existing authenticated endpoints for public traffic isn't advisable even if the auth requirement were dropped, for two reasons:

1. **Data exposure.** `/products` and `/product-stock-summary` return internal fields that must never be public — `average_acquisition_price`, `available_inventory_cost`, and other cost/margin data would hand a competitor real pricing intelligence. `/products` also has no server-side filter for discontinued or out-of-stock items — the storefront currently filters those client-side, which only "works" because nothing gets to the client at all right now (everything 401s). If `/products` were simply made public as-is, every discontinued/sold-out product and every cost field would ship to any visitor's browser.
2. **Decoupling.** A public endpoint is a permanent public contract. Keeping it separate from the admin's internal `/products` shape means the admin API can keep evolving (new internal fields, refactors) without ever having to think about what's safe to expose publicly, and vice versa.

### Proposed: `GET /public/products` and `GET /public/products/:id`

No `Authorization` header required or checked — genuinely anonymous, same as the rest of this API is described as requiring auth "for any authenticated user," these should require none at all.

**Filtering (server-side, not left to the client):**
- `is_discontinued = false`
- Has at least one inventory item with `status = AVAILABLE` (i.e., `available_quantity > 0`) — don't advertise something with nothing in stock

**Response shape** — one object per product, matching what the storefront currently has to assemble client-side by joining three authenticated calls together:

```json
{
  "success": true,
  "data": [
    {
      "id": 8,
      "sku": "CASIO-MTP-1375D-1AVDF",
      "name": "Casio MTP-1375D-1AVDF Silver Black Dial",
      "brand": "Casio",
      "model_no": "MTP-1375D-1AVDF",
      "category": "Watch",
      "condition_label": "Brand New",
      "movement_type": "Quartz",
      "case_size": "36mm",
      "gender_label": "Men's",
      "description": "…",
      "price": 4100,
      "images": [
        { "url": "https://pub-….r2.dev/products/8/….png", "is_default": true, "sort_order": 0 }
      ],
      "created_at": "2026-08-08T03:12:45.000Z"
    }
  ]
}
```

Field notes:
- `price` — from `product_stock_summary.average_current_selling_price`. **Never include `average_acquisition_price`, `available_inventory_cost`, or any other cost/margin field here.**
- `images` — same shape already used in `product_images` (`docs/product-image-upload-handover.md`), just `url`/`is_default`/`sort_order` — no `id`/`storage_key` needed publicly.
- `category` — a plain name string is enough; the frontend groups products into "Watches" vs "Fragrance" by matching keywords in this string (`src/utils/productCategory.js`), so it doesn't need to be a structured type.
- Any field not listed above (`gender_label`, `case_size`, etc.) that's genuinely empty for a given product — omit or `null`, whichever is easiest; the frontend already handles missing fields gracefully.
- `GET /public/products/:id` — same object shape, single product, for the individual product pages. `404` (with the same `{ success: false, error }` envelope the rest of the API uses) if the id doesn't exist, is discontinued, or has no stock — a delisted product shouldn't resolve to a page that leaks it existed.

Pagination: not required for launch — every other list endpoint in this API currently ignores pagination params and returns the full set (see the frontend README's notes on this), and the catalog is small enough that matching that existing convention is fine. Add real pagination later if the catalog grows enough to matter.

### Is this urgent?

Not launch-blocking in the sense of "something is broken" — the storefront already degrades gracefully to a clear "check back soon" message rather than erroring. But the storefront has no actual products to show a customer until this exists, so it's blocking the storefront being useful at all.

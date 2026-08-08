# Product Image Upload — Frontend Handover

Feature: multiple image upload per product, stored in Cloudflare R2, with the ability to mark one image as the product's default.

Base URL: `/api/products` (mounted under whatever host serves `/api`, e.g. `https://<api-host>/api/products`)

Full interactive reference for these and every other endpoint: **`GET /api-docs`** (Swagger UI) / **`GET /api-docs.json`** (raw OpenAPI spec).

---

## Auth (read this first)

Every endpoint below requires a Supabase access token:

```
Authorization: Bearer <access_token>
```

Get `access_token` from `POST /api/auth/login` (or `/register`, `/refresh`). It's a short-lived Supabase JWT — refresh it via `POST /api/auth/refresh` when it expires (401).

| Operation | Who can call it |
|---|---|
| `GET` endpoints (list/read products, list images) | Any authenticated user |
| `POST` / `PUT` / `PATCH` / `DELETE` (create/update/delete product, upload/delete/set-default image) | `admin` or `superadmin` role only |

A request with no/invalid token gets `401`. An authenticated request from a role below `admin` on a write endpoint gets `403`.

**Note:** this auth requirement is new as of this feature — `/api/products` (and most other resources) previously had no auth at all. If your frontend was calling it unauthenticated, those calls will now start failing with `401` until a token is attached.

---

## Response envelope

Every response follows the same shape:

```json
// success
{ "success": true, "data": { ... } }

// error
{ "success": false, "error": "Human-readable message" }
```

Status codes used: `200`, `201` (created), `400` (bad request), `401` (not authenticated), `403` (wrong role), `404` (not found).

---

## Product image object shape

Every image row returned by any endpoint below looks like this:

```json
{
  "id": 42,
  "product_id": 7,
  "storage_key": "products/7/3f9a1c2e-....jpg",
  "url": "https://<your-r2-public-domain>/products/7/3f9a1c2e-....jpg",
  "is_default": true,
  "sort_order": 0,
  "created_at": "2026-08-08T03:12:45.000Z",
  "updated_at": "2026-08-08T03:12:45.000Z"
}
```

`url` is what you render in `<img src>` — it's a fully-qualified public URL, ready to use directly. There is no separate "get image" endpoint; images are served straight from R2/CDN.

**At most one image per product ever has `is_default: true`** (enforced at the DB level, not just in the API) — safe to assume exactly 0 or 1 default when there's at least one image.

---

## Endpoints

### `GET /api/products` and `GET /api/products/:id`

Unchanged from before, except each product now embeds its images:

```json
{
  "success": true,
  "data": {
    "id": 7,
    "sku": "ABC-123",
    "product_name": "Example Watch",
    "...": "...other product columns...",
    "product_images": [
      { "id": 42, "url": "https://.../a.jpg", "is_default": true, "sort_order": 0, "created_at": "..." },
      { "id": 43, "url": "https://.../b.jpg", "is_default": false, "sort_order": 1, "created_at": "..." }
    ]
  }
}
```

Use this to render a product card/detail page without a second request. To find the thumbnail: `product.product_images.find(img => img.is_default)?.url`.

---

### `GET /api/products/:id/images`

List a single product's images, ordered by `sort_order` ascending (default image is not guaranteed to be first — check `is_default` explicitly).

**Response `200`:**
```json
{ "success": true, "data": [ { "id": 42, "product_id": 7, "url": "...", "is_default": true, "sort_order": 0, "...": "..." } ] }
```

---

### `POST /api/products/:id/images` — upload images

`multipart/form-data` request.

| Field | Required | Notes |
|---|---|---|
| `images` | yes | One or more files. Field name must be exactly `images` (repeat the field for multiple files). Max **10 files**, **5MB** each. Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`. |
| `defaultIndex` | no | 0-based index **within this upload batch** to mark as the default image (e.g. `1` = the 2nd file in this request becomes default). |

**Default-image behavior:**
- If the product has **no images yet** and you don't send `defaultIndex`, the **first file in the batch** automatically becomes the default.
- If you send `defaultIndex`, that file becomes the default and any previously-default image for the product is cleared.
- If the product already has images and you don't send `defaultIndex`, the existing default is left untouched — newly uploaded files are added as non-default.

**Response `201`:** array of the newly created image rows (same shape as above), in upload order.

**Errors:**
- `400` — no files sent, wrong field name, unsupported file type, file too large.
- `404` — product doesn't exist.

#### Example (fetch)

```js
const form = new FormData();
for (const file of selectedFiles) form.append('images', file);
form.append('defaultIndex', '0'); // optional

const res = await fetch(`/api/products/${productId}/images`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` }, // do NOT set Content-Type manually — the browser sets the multipart boundary
  body: form,
});
const { success, data, error } = await res.json();
```

---

### `PATCH /api/products/:id/images/:imageId/default` — set default image

No request body needed.

**Response `200`:** the updated image row (`is_default: true`). Any other image on the same product that was previously default is cleared automatically.

**Errors:** `404` if `imageId` doesn't belong to `id`.

---

### `DELETE /api/products/:id/images/:imageId` — delete an image

Deletes the image from R2 storage and the database.

**Response `200`:**
```json
{ "success": true, "message": "Image 42 deleted from product 7" }
```

**Behavior:** if the deleted image was the default, the next remaining image (lowest `sort_order`) is automatically promoted to default. If it was the last image, the product simply has none (no default).

**Errors:** `404` if `imageId` doesn't belong to `id`.

---

## Quick reference

| Method | Path | Role |
|---|---|---|
| GET | `/api/products/:id/images` | any authenticated |
| POST | `/api/products/:id/images` | admin/superadmin |
| PATCH | `/api/products/:id/images/:imageId/default` | admin/superadmin |
| DELETE | `/api/products/:id/images/:imageId` | admin/superadmin |

## Open items / things the frontend should know

- Bucket/CDN domain for image `url`s depends on backend env config (`R2_PUBLIC_URL`) — confirm with backend which domain is live before hardcoding it anywhere.
- There's no dedicated "reorder images" endpoint yet — `sort_order` is currently only set at upload time (append order). Ask backend if drag-to-reorder is needed.
- There's no image replace/edit-in-place endpoint — to replace an image, delete it and upload a new one.

# Product Image Upload — Endpoint Verification Report

Purpose: confirm the exact, correct endpoint URLs for the product image upload feature, after live testing against the deployed backend surfaced two URL mistakes during manual testing. Use this alongside the full reference: [`docs/product-image-upload-handover.md`](./product-image-upload-handover.md).

Base URL (deployed): `https://vaelora-be.vercel.app`

---

## Status: verified working end-to-end

Tested live against the deployed backend on 2026-08-08.

| Step | Result |
|---|---|
| `POST /api/products/8/images` (upload) | ✅ `201`, DB row created, R2 object stored |
| DB check (`product_images` table, `id=1`) | ✅ row exists, `product_id=8`, `is_default=true` |
| R2 object check (public URL) | ✅ `200 OK`, `image/png`, ~1MB, publicly reachable |

Example real response from a successful upload:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "product_id": 8,
      "storage_key": "products/8/dedb4ce8-a791-4452-afdd-25d76e09a997.png",
      "url": "https://pub-61b587ddc953441e979f27568e9e2931.r2.dev/products/8/dedb4ce8-a791-4452-afdd-25d76e09a997.png",
      "is_default": true,
      "sort_order": 0,
      "created_at": "2026-08-08T11:52:52.208799+00:00",
      "updated_at": "2026-08-08T11:52:52.208799+00:00"
    }
  ]
}
```

---

## Exact endpoint URLs — copy these exactly

All four image endpoints take **both** a product id and, where relevant, an image id, as separate path segments. Do not drop or collapse any segment.

| Action | Method | URL pattern |
|---|---|---|
| List images | `GET` | `/api/products/{productId}/images` |
| Upload image(s) | `POST` | `/api/products/{productId}/images` |
| Set default image | `PATCH` | `/api/products/{productId}/images/{imageId}/default` |
| Delete image | `DELETE` | `/api/products/{productId}/images/{imageId}` |

Worked example using the real IDs from the test above (`productId=8`, `imageId=1`):

```
GET    /api/products/8/images
POST   /api/products/8/images
PATCH  /api/products/8/images/1/default
DELETE /api/products/8/images/1
```

---

## Mistakes seen during manual testing — avoid these

**1. Dropping the `{imageId}` segment on the "set default" endpoint**

Wrong (missing image id entirely):
```
PATCH /api/products/8/images
```
Wrong (image id dropped, only `default` left):
```
PATCH /api/products/8/images/default
```
Correct — image id sits between `images` and `default`:
```
PATCH /api/products/8/images/1/default
```
Both wrong versions return `404 { "success": false, "error": "Route not found: ..." }` — the route genuinely doesn't exist at those paths, this isn't a server bug.

**2. Sending the file field as Text instead of File (Postman)**

In Postman, Body → `form-data`, the `images` key defaults to type **Text**. If left as Text, no actual file bytes are sent, so the server silently receives zero files. You must hover the key row and switch the type dropdown to **File**, then pick the file. See the full handover doc's Postman section for the complete field-by-field setup.

---

## Quick sanity checklist before reporting "it doesn't work"

- [ ] Product id and (for default/delete) image id are both present as separate path segments, in the right order.
- [ ] `Authorization: Bearer <token>` header is set, using a token for an `admin`/`superadmin` user (writes 403 for other roles).
- [ ] Body is `multipart/form-data` (Postman: `form-data`, not `raw`/`x-www-form-urlencoded`).
- [ ] The `images` field is set to type **File**, not Text, with an actual file selected.
- [ ] No manual `Content-Type` header set — let the client generate the multipart boundary automatically.

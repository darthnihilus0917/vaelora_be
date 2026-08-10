# Public Storefront Endpoints — Handover & Confirmation Needed

Status as of this handover: **endpoints are built and verified against real data, but NOT yet deployed.** They exist only in the backend's working tree — not committed, not pushed, not live on Vercel. Do not attempt to test them against `https://vaelora-be.vercel.app` until backend confirms deployment is done. This doc will be updated (or a follow-up sent) once that happens.

This implements what `docs/public-storefront-backend-handover.md` requested. Read that doc first for the full context/reasoning (why these are separate endpoints, what data is deliberately excluded, etc.) — this doc is the confirmation + exact contract, not a replacement for it.

---

## ⚠️ Action needed from frontend before integrating

**Had the frontend already provisioned or assumed a different public catalog endpoint** — mock data, a placeholder URL, a different path, or anything built against the guess `GET /public/products` (without `/api`) as literally written in the original handover doc?

- **If yes** — tell backend before wiring anything up, so the two sides can reconcile on one URL instead of the frontend silently pointing at something that no longer matches.
- **If no** — use the endpoints exactly as documented below. The path deliberately differs from the original handover doc's shorthand (see note).

---

## The endpoints

| Method | Path | Auth |
|---|---|---|
| `GET` | `/api/public/products` | None — genuinely public |
| `GET` | `/api/public/products/:id` | None — genuinely public |

**Path note:** the original handover doc wrote `GET /public/products` (no `/api` prefix). That was shorthand — the doc used the same unprefixed style for every existing endpoint too (e.g. wrote `GET /products` for what is actually `GET /api/products`). Every endpoint in this backend lives under `/api/*`, admin and public alike, so these were implemented at `/api/public/products` to stay consistent with that. **Use `/api/public/products`, not `/public/products`.**

No `Authorization` header is sent or checked on these two routes — confirmed by direct test (see Verification below).

---

## Response shape

`GET /api/public/products`:

```json
{
  "success": true,
  "data": [
    {
      "id": 8,
      "sku": "CAS-F-91W-1",
      "name": "Casio F-91W-1 Classic Retro Digital Watch",
      "brand": "Casio",
      "model_no": "F-91W-1",
      "category": "Watch",
      "condition_label": "Brand New",
      "movement_type": "Quartz",
      "case_size": null,
      "gender_label": null,
      "description": null,
      "price": 1000,
      "images": [
        { "url": "https://pub-….r2.dev/products/8/….png", "is_default": true, "sort_order": 0 }
      ],
      "created_at": "2026-08-05T00:00:00.000Z"
    }
  ]
}
```

`GET /api/public/products/:id` returns the same single object shape (not wrapped in an array), or `404 { "success": false, "error": "Product not found" }` if the id doesn't exist, is discontinued, or has zero available stock.

Fields that are genuinely empty for a product come back as `null` (not omitted) — e.g. `case_size`/`gender_label` above.

No pagination — full filtered list every time, matching the original doc's instruction (catalog is small enough for now).

---

## Filtering applied server-side (nothing left to the client)

A product only appears if **both**:
- `is_discontinued = false`
- it has available stock (`available_quantity > 0`, computed from inventory, not left to a client-side count)

Verified against the live database at handover time: 38 non-discontinued products exist, 14 currently pass the stock filter and would appear in this endpoint.

---

## What is deliberately NOT in the response

No cost or margin data of any kind — `average_acquisition_price`, `available_inventory_cost`, or anything like it. Only `price` (the current selling price) is exposed. No internal image `id`/`storage_key` either — only `url`/`is_default`/`sort_order`, same trimmed shape used elsewhere for public-facing image data.

---

## What frontend should test once backend confirms this is deployed

- [ ] `GET /api/public/products` with **no** `Authorization` header returns `200` with data (not `401`).
- [ ] Every product in the response has stock and is not discontinued — spot-check a couple ids against the admin `/api/products` view.
- [ ] `GET /api/public/products/:id` for a valid, in-stock, non-discontinued id returns that product.
- [ ] `GET /api/public/products/:id` for a discontinued or out-of-stock id returns `404`, not the product data.
- [ ] `GET /api/public/products/:id` for a made-up id (e.g. `999999`) returns `404`.
- [ ] No response anywhere contains a cost/margin-looking field.
- [ ] `images` array items only have `url`/`is_default`/`sort_order` — no `id` or `storage_key` leaking through.

## Verification already done on the backend side

- Route reachability and no-auth-required confirmed by direct in-process request (no `401` returned).
- The exact filter logic (`is_discontinued=false AND available_quantity>0`) run as raw SQL against the live database — matches the endpoint's query logic, not just tested in isolation.
- The `categories`/`product_images` join pattern used here is the same PostgREST embedding pattern already proven working in the existing `/api/products` admin endpoint.

Not yet done: a live HTTP smoke test against the deployed URL, since this hasn't been deployed yet.

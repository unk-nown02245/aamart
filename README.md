# Aamart

Single-owner e-commerce storefront with a super-admin and manager admin panel.
Mobile-first, bilingual (English / हिंदी), INR pricing, and zero npm dependencies.

## Requirements

- Node.js 22.5+ (tested on v24.19.0) with the built-in `node:sqlite` module
- No `npm install` required

## Quick start

```bash
node server.js
```

Open http://localhost:4000

Set a custom port with `PORT`, e.g. `PORT=8080 node server.js`.

The SQLite database is created and seeded automatically at `data/aamart.db` on first
run. To reset all data, stop the server and delete `data/aamart.db` (and optionally
`uploads/`), then start it again.

## Accounts

| Role | URL | Username | Password |
| --- | --- | --- | --- |
| Super Admin | `/admin` | `amirhamza` | `akib@123` |
| Manager | `/admin` | `aditism` | `aditi@123` |
| Demo customer | `/` | `test@aamart.in` | `test@123` |

Change these credentials before deploying to production.

## Admin routes

- `/admin` — admin login
- `/admin/amirhamza` — super admin panel
- `/admin/aditism` — manager panel
- `/admin/products` — product control panel

The admin panel is a hash-routed SPA (`#/dashboard`, `#/products`, `#/orders`,
`#/reviews`, `#/categories`, `#/brands`, `#/banners`, `#/coupons`, `#/customers`,
`#/settings`, `#/admins`, `#/inventory`, `#/logs`).

Managers can access dashboard, products, orders, and reviews. Super admins can access
everything, including settings, customers, staff accounts, and activity logs.

## Features

Storefront:

- Home page with banners, categories, featured products, and offers
- Search, category/subcategory filtering, sorting, and pagination
- Product detail with images, variants, specs, reviews, and stock status
- Cart, wishlist, saved addresses, coupons, and COD/online payment selection
- Customer registration/login, order history, cancellation, and reviews
- English/Hindi language toggle and INR currency formatting

Admin:

- Dashboard metrics and recent orders
- Product CRUD, variants, specs, images, bulk JSON upload, and stock toggle
- Order management with status history
- Review moderation
- Category, brand, banner, and coupon management
- Customer list with order/spend summary
- Store settings, staff account management, inventory log, and activity log
- Image upload with type/size validation

## API overview

Public: `/api/health`, `/api/settings`, `/api/categories`, `/api/brands`,
`/api/banners`, `/api/products`, `/api/products/:id`, `/api/products/:id/reviews`

Customer (Bearer token): `/api/auth/*`, `/api/cart`, `/api/wishlist`,
`/api/addresses`, `/api/orders`, `/api/coupons/validate`, `/api/reviews`

Admin (Bearer token, role-checked): `/api/admin/login`, `/api/admin/me`,
`/api/admin/stats`, and CRUD endpoints for products, categories, brands, banners,
coupons, orders, reviews, customers, settings, admins, inventory, logs, and upload.

All state-changing requests require a CSRF double-submit token: the `csrf` cookie plus
the `X-CSRF-Token` header. Fetch `/api/health` first to obtain the cookie.

## Security

- Passwords hashed with scrypt and per-user salts
- HMAC-signed session tokens with customer/admin separation
- Role-based access control (`super` / `manager`)
- Rate limiting on login and write endpoints
- CSRF double-submit protection (login endpoints exempt)
- Upload validation by magic bytes (PNG/JPEG/GIF/WEBP, max 4 MB)
- Security headers on all responses

## Project structure

```
server.js          HTTP server, routing, APIs, static file serving
lib/db.js          SQLite schema, seeds, and data helpers
lib/security.js    Hashing, tokens, IDs, and secret management
public/            Storefront and admin frontend assets
public/img/        Seeded SVG product/banner images
data/              SQLite database (created at runtime)
uploads/           Uploaded images (created at runtime)
tests/e2e.js       End-to-end API test suite
```

## Testing

With the server running on port 4000:

```bash
node tests/e2e.js
```

The suite covers health/static assets, catalog, customer auth, cart, wishlist,
coupons, orders, admin auth, full admin CRUD, uploads, settings, staff accounts,
inventory, activity logs, order status flow, reviews, and manager RBAC. It creates
temporary records and cleans up after itself.

## Deployment notes

- Run behind a reverse proxy with HTTPS.
- Persist `data/` and `uploads/` between deployments.
- Change the seeded admin passwords and the demo customer account.
- Keep `PORT` and filesystem permissions restricted to the service user.

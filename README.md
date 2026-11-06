# Aamart

Single-owner e-commerce storefront with a super-admin and manager admin panel.
Mobile-first, bilingual (English / Hindi), INR pricing, and zero npm dependencies.

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

## Admin credentials

| Role | Username | Password |
| --- | --- | --- |
| Super Admin | `amirhamza` | `akib@123` |
| Manager | `aditism` | `aditi@123` |

These are the requested project defaults. Change them from **Admin > Change password**
before using the store publicly. `AAMART_SUPER_PASSWORD` and
`AAMART_MANAGER_PASSWORD` override them when the credentials are first synced. The
current values are also written to `data/ADMIN-CREDENTIALS.txt` (gitignored).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `4000`) |
| `AAMART_SUPER_PASSWORD` | Override the super-admin password on first credential sync |
| `AAMART_MANAGER_PASSWORD` | Override the manager password on first credential sync |
| `AAMART_TOKEN_TTL_MS` | Session lifetime in ms (default 365 days, minimum 15 minutes) |
| `AAMART_SECRET` | Stable token/OTP signing secret. Set a long random value on Render |
| `AAMART_TRUST_PROXY=1` | Trust `X-Forwarded-For` / `X-Real-IP` (set only behind a trusted proxy) |
| `AAMART_ONLINE_PAYMENTS=1` | Allow online payment methods (gateway integration still required) |
| `AAMART_EMAIL_FROM` | Verified sender address for OTP emails |
| `AAMART_BREVO_API_KEY` | Brevo HTTPS API key for OTP emails |
| `AAMART_RESEND_API_KEY` | Resend API key for OTP emails |
| `AAMART_EMAIL_WEBHOOK_URL` | Alternative HTTPS email webhook |
| `AAMART_EMAIL_WEBHOOK_TOKEN` | Bearer token for the email webhook |
| `AAMART_OTP_DEBUG=1` | Log OTPs to the server console for local testing only |
| `SUPABASE_URL` | Free Supabase project URL for cloud backup/restore |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side only, never expose it) |
| `AAMART_BACKUP_BUCKET` | Private Supabase Storage bucket (default `aamart-backups`) |

OTP login and password reset stay disabled until `AAMART_EMAIL_FROM` plus either
`AAMART_BREVO_API_KEY`, `AAMART_RESEND_API_KEY`, or `AAMART_EMAIL_WEBHOOK_URL` are
configured. Do not enable `AAMART_OTP_DEBUG` in production.

### Free Brevo OTP setup (works on Render)

Render free web services cannot send SMTP on ports 25, 465, or 587. Use Brevo's HTTPS
API instead:

1. Create a free Brevo account and verify your Gmail address as a sender.
2. Set `AAMART_EMAIL_FROM` to that Gmail address.
3. Set `AAMART_BREVO_API_KEY` to the Brevo API key.
4. OTP login and password reset become available automatically.

### Free cloud data backup (Supabase Storage)

Render free has an ephemeral filesystem. To keep users, carts, wishlists, orders, and
uploads across restarts:

1. Create a free Supabase project.
2. Copy the project URL and service-role key into `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` on Render.
3. The app creates the private `aamart-backups` bucket automatically.
4. Set `AAMART_SECRET` to a long random value so existing logins survive restarts.
5. Keep the Supabase project active (the app pings it from `/api/health`).

The app restores the latest backup on startup and uploads a new backup after writes and
on shutdown. If a backup exists but restore fails, the app stops instead of starting
with an empty database. Free Supabase projects can pause after a week without activity;
the keep-alive ping prevents that while the Render service is running.

## Admin routes

- `/admin` - admin login
- `/admin/amirhamza` - super admin panel
- `/admin/aditism` - manager panel
- `/admin/products` - product control panel

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
- Cart, wishlist, saved addresses, coupons, and Cash on Delivery checkout
- Customer registration/login, order history, cancellation, and reviews
- English/Hindi language toggle and INR currency formatting
- Privacy, terms, returns, and contact pages

Admin:

- Dashboard metrics and recent orders
- Product CRUD, variants, specs, images, bulk JSON upload, and stock toggle
- Order management with validated status transitions and stock restoration on cancel
- Review moderation
- Category, brand, banner, and coupon management
- Customer list with order/spend summary
- Store settings, staff account management, password change, inventory log, and activity log
- Image upload with type/size validation

## Payments

Only Cash on Delivery is active. Online payment methods are hidden and rejected at
checkout until a real payment gateway is integrated and verified server-side. Orders
are never marked paid without a verified gateway response.

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
- Strong-password policy (10+ chars, upper/lower/number)
- HMAC-signed session tokens with customer/admin separation and revocation via `token_version`
- Role-based access control (`super` / `manager`)
- Rate limiting on login, OTP, registration, and write endpoints
- CSRF double-submit protection on every state-changing request
- Hashed, expiring, single-use OTPs; no demo OTP returned by the API
- No automatic account creation through OTP login
- Upload validation by magic bytes (PNG/JPEG/GIF/WEBP, max 4 MB)
- Security headers on all responses (CSP, HSTS, COOP/CORP, frame protection)
- Safe URL validation for banners, product images, and links

## Project structure

```
server.js          HTTP server, routing, APIs, static file serving
lib/db.js          SQLite schema, migrations, secure seeds
lib/security.js    Hashing, tokens, password/OTP helpers, secret management
lib/mailer.js      Email/OTP delivery (Resend or HTTPS webhook)
public/            Storefront and admin frontend assets
public/img/        Seeded SVG product/banner images
data/              SQLite database and generated admin credentials (gitignored)
uploads/           Uploaded images (gitignored)
tests/e2e.js       End-to-end API test suite
```

## Testing

With the server running on port 4000:

```bash
node tests/e2e.js
```

Set `AAMART_SUPER_PASSWORD` and `AAMART_MANAGER_PASSWORD` before the first run if the
test suite needs known admin credentials. The suite covers health/static assets,
catalog, customer auth, cart, wishlist, coupons, orders, admin auth, full admin CRUD,
uploads, settings, staff accounts, inventory, activity logs, order status flow,
reviews, and manager RBAC.

## Deployment notes

- Run behind a reverse proxy with HTTPS.
- Persist `data/` and `uploads/` between deployments, or use the free Supabase cloud
  backup described above.
- Set `AAMART_TRUST_PROXY=1` only when a trusted reverse proxy is in front.
- Store `data/ADMIN-CREDENTIALS.txt` in a secret manager, then delete it.
- Render's free tier has an ephemeral filesystem. Without `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`, SQLite data, uploads, and secrets reset on restart.
- Keep `PORT` and filesystem permissions restricted to the service user.

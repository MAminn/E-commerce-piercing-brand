# Coolify Deployment — Piercing Brand

This repository deploys as its **own** Coolify application, fully independent of
any other brand running on the same VPS. Nothing here should be pointed at, or
copied from, an existing brand's application, database, or volume.

---

## 1. Application settings

| Setting | Value |
|---|---|
| Repository | `https://github.com/MAminn/E-commerce-piercing-brand.git` |
| Branch | `master` |
| Build pack | **Dockerfile** |
| Base directory | `/` |
| Dockerfile location | `/Dockerfile` |
| Ports exposed | `3000` |
| Health check path | `/health` |

The container runs `pnpm start` → Fastify on `0.0.0.0:3000`, serving both the
API and the server-rendered frontend. There is no separate frontend service.

### Health check

`GET /health` returns `{"status":"ok","timestamp":<ms>}`.

It is registered before every other route, but the process only starts
listening **after** migrations have run and the database connection has been
verified. On a first deploy against an empty database that takes roughly
15–30 seconds, so give the health check a start period of at least **60s**
before it is allowed to mark the container unhealthy.

---

## 2. PostgreSQL

Create a **new, separate** PostgreSQL resource in Coolify for this project.
Do not attach the existing brand's database — the schema is compatible, which
makes an accidental cross-connection silent and destructive.

Suggested resource name: `piercing-brand-db`, database name `piercing_brand`.

### DATABASE_URL

Inside Coolify's network, `localhost` is the *application container itself* and
will never reach the database. Use the Postgres resource's **internal service
hostname**:

```
postgresql://<user>:<password>@<internal-hostname>:5432/piercing_brand
```

e.g. `postgresql://postgres:<generated-password>@piercing-brand-db:5432/piercing_brand`

Coolify shows the exact internal hostname/URL on the database resource page —
copy it from there rather than guessing. The local value in `.env`
(`localhost:8053`) is for local development only and is never valid in Coolify.

### Migrations

None to run manually. `shared/database/auto-migrate.ts` applies every pending
file in `shared/database/migrations` on each boot, and is idempotent — a fresh
database is fully provisioned by the first successful start.

---

## 3. Persistent storage (required)

Uploaded media (product images, logos, custom fonts) is written to the
filesystem and is **not** in the database. Without a volume it is lost on every
redeploy.

| Type | Destination path |
|---|---|
| Volume | `/app/uploads` |

Use a volume name unique to this app (e.g. `piercing-brand-uploads`). Never
mount another brand's uploads volume.

---

## 4. Environment variables

### Required

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DATABASE_URL` | internal Postgres URL — see above |
| `BASE_URL` | `https://<your-domain>` — public HTTPS origin, no trailing slash |
| `PUBLIC_ORIGIN` | `https://<your-domain>` |
| `SINGLE_SHOP_MODE` | `true` |
| `VITE_SINGLE_SHOP_MODE` | `true` |
| `BETTER_AUTH_SECRET` | **newly generated** 32-byte random hex (see below) |
| `ADMIN_EMAIL` | the real admin login email for this brand |
| `ADMIN_PASSWORD` | a **new** strong password (re-applied to the account on every boot) |

`VITE_*` variables are baked in at image build time, so changing
`VITE_SINGLE_SHOP_MODE` requires a rebuild, not just a restart.

Generate secrets fresh, per environment:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Must never be copied from another brand

* `BETTER_AUTH_SECRET` — a shared secret makes sessions valid across both
  sites.
* `DATABASE_URL` — would put two storefronts on one catalog and order book.
* `ADMIN_PASSWORD` / `SUPERADMIN_PASSWORD`.
* Any payment, shipping, SMTP or pixel credential — these are tied to the other
  brand's merchant accounts and would route this shop's money, shipments and
  analytics to them.

### Optional — leave unset until the brand actually has them

Every one of these is inert when unset; the app logs a warning and disables the
feature rather than failing to boot.

| Group | Variables | Effect when unset |
|---|---|---|
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Outbound email skipped |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLIC_KEY` | Stripe checkout hidden |
| Paymob | `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_CARD_INTEGRATION_ID`, `PAYMOB_WALLET_INTEGRATION_ID`, `PAYMOB_HMAC_SECRET`, `PAYMOB_BASE_URL` | Paymob checkout hidden |
| Fincart | `FINCART_ENABLED`, `FINCART_API_URL`, `FINCART_API_KEY`, `FINCART_WEBHOOK_SECRET`, `FINCART_PICKUP_ID`, `FINCART_MERCHANT_LOCATION` | Shipping integration off |
| Bosta | `SYN_BOSTA_KEY`, `BOSTA_WEBHOOK_SECRET`, `BOSTA_EGYPT_COUNTRY_ID`, `BOSTA_PICKUP_*` | Shipping integration off |
| Superadmin | `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | `/dashboard/superadmin/sync` (full DB export/import) not bootstrapped — recommended for production |
| Social login | `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_CLIENT_ID/SECRET` | Providers hidden |
| Misc | `TRUSTED_ORIGINS`, `STORE_OWNER_ID`, `VITE_STORE_NAME`, `VITE_CURRENCY`, `PROD_ASSET_ORIGIN` | Sensible defaults |

With no payment gateway configured the store runs **COD-only**, which is a
valid production configuration.

Set `TRUSTED_ORIGINS` (comma-separated) if the site is reachable on more than
one hostname, e.g. `https://example.com,https://www.example.com` — otherwise
auth requests from the second hostname are rejected.

---

## 5. Webhook URLs

Configure these in the respective provider dashboards once those integrations
are enabled:

| Provider | URL |
|---|---|
| Stripe | `https://<domain>/api/webhooks/stripe` |
| Paymob | `https://<domain>/api/webhooks/paymob` |
| Fincart | `https://<domain>/api/webhooks/fincart` |
| Bosta | `https://<domain>/api/webhooks/bosta` |

---

## 6. First deploy checklist

1. Create the PostgreSQL resource; copy its internal URL.
2. Create the application from this repo/branch with the Dockerfile build pack.
3. Add the `/app/uploads` persistent volume **before** the first deploy.
4. Set the required environment variables, with freshly generated secrets.
5. Deploy, then watch the logs for `✅ [Auto-Migrate] Done — 54 applied`.
6. Confirm `https://<domain>/health` returns `{"status":"ok"}`.
7. Log in at `https://<domain>/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   and configure branding, templates and catalogue from the dashboard.

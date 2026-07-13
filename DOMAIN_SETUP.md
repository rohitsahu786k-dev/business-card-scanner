# Production Domain Setup — scanner.onepws.com

Canonical origin: **https://scanner.onepws.com**
`www.scanner.onepws.com` and any `http://` form must redirect to it.

The app-side redirect (www → apex) is handled in `next.config.mjs`. The rest is
external DNS + Vercel dashboard configuration that **cannot be done from the
codebase** and must be verified in the Vercel/registrar dashboards.

## Why `http://www.scanner.onepws.com/` currently fails
Almost always one of: (a) `www` subdomain not added to the Vercel project, or
(b) no DNS record for `www`, or (c) the domain is assigned but not verified, so
no SSL certificate is issued for that host. Confirm which in the steps below.

## Steps to perform in the Vercel dashboard
1. Project → **Settings → Domains**. Ensure BOTH are added:
   - `scanner.onepws.com` (set as **Primary / canonical**)
   - `www.scanner.onepws.com` (set to **Redirect → scanner.onepws.com**, 308)
2. Wait until each shows **Valid Configuration** and an issued SSL certificate.
3. Redeploy `main` (production) after domains are green.

## DNS records (at the onepws.com registrar / DNS host)
- `scanner` → **A** record `76.76.21.21` (Vercel), or **CNAME** `cname.vercel-dns.com`
- `www.scanner` → **CNAME** `cname.vercel-dns.com`

Use CNAME where the host allows it; use Vercel's exact target if the dashboard
shows a different value. Do not point `www` and apex at different origins.

## Environment variables (Vercel → Settings → Environment Variables)
Verify these exist and are scoped to **Production** (and Preview where needed):
- `NEXTAUTH_URL = https://scanner.onepws.com`  ← must be the canonical https apex
- `NEXTAUTH_SECRET` (unchanged; rotating it logs everyone out)
- `MONGODB_URI`
- `OPENAI_API_KEY`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

A wrong `NEXTAUTH_URL` (http, or www) is the most common cause of login/session
failures on the production domain. Fix it, then redeploy.

## Verification checklist (run after DNS + Vercel are green)
```
curl -I http://scanner.onepws.com        # -> 3xx to https://scanner.onepws.com
curl -I http://www.scanner.onepws.com     # -> 3xx to https://scanner.onepws.com
curl -I https://www.scanner.onepws.com    # -> 3xx to https://scanner.onepws.com
curl -s https://scanner.onepws.com/api/health   # -> {"status":"ok", ...}
```
Then in a browser on the https apex: log in, open the scanner (camera permission
prompt must appear — camera only works over https), scan, and confirm the
session persists after refresh.

## Status
- [x] App-level www → apex redirect committed (`next.config.mjs`)
- [x] `/api/health` route added (safe status only)
- [ ] Vercel domains added + verified (external — dashboard access required)
- [ ] DNS records confirmed (external — registrar access required)
- [ ] `NEXTAUTH_URL` confirmed = `https://scanner.onepws.com` (external)
- [ ] End-to-end verification on production domain

**Do not consider the domain fixed until every box above is checked.**

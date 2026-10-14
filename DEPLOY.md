# Deploying to Cloudflare

Replace `YOUR-DOMAIN.com` with a domain that is already on your Cloudflare account, and
`you@example.com` with your exact email address. You need Node.js 20+.

## 1. Install Wrangler and log in

```bash
npm install          # installs Wrangler locally with the project
npx wrangler login   # opens a browser; approve access
npx wrangler whoami  # confirm it shows your account
```

## 2. Create the database and the screenshot bucket

```bash
npx wrangler d1 create trade-journal
npx wrangler r2 bucket create trade-journal-screenshots
```

The first command prints a `database_id` (a UUID). Open [wrangler.jsonc](wrangler.jsonc) and paste it:

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "trade-journal",
                   "database_id": "PASTE-THE-ID-HERE", "migrations_dir": "migrations" }]
```

The bucket name is already `trade-journal-screenshots` in the same file.

## 3. Run the migrations on the remote database

```bash
npm run db:migrate:remote
```

This applies `0001_init.sql` and `0002_price_precision.sql` (prices and strikes to 1/10000 dollar units). Run it again whenever new migration files are added.

## 4. Deploy

Do steps 5 and 6 first if you want to be safe: until Access is configured the API refuses all
requests (it fails closed), so deploying early exposes nothing.

```bash
npm run deploy
```

`workers_dev` and preview URLs are disabled in `wrangler.jsonc`, so the Worker is only reachable
through your own domain once step 5 is done.

## 5. Attach the custom domain `journal.YOUR-DOMAIN.com`

Either in the dashboard: **Workers & Pages → trade-journal → Settings → Domains & Routes → Add →
Custom domain**, enter `journal.YOUR-DOMAIN.com`.

Or in [wrangler.jsonc](wrangler.jsonc): uncomment the `routes` line, set your domain, and run
`npm run deploy` again.

## 6. Protect it with Cloudflare Access (Zero Trust)

1. Open the Cloudflare dashboard → **Zero Trust**. If asked, pick a **team name** and the free plan.
   Your team domain is `https://<TEAM_NAME>.cloudflareaccess.com`. Note the `<TEAM_NAME>`.
2. **Settings → Authentication → Login methods**: make sure **One-time PIN** is enabled.
3. **Access → Applications → Add an application → Self-hosted**.
   - Application name: `Trade Journal`
   - Public hostname: `journal.YOUR-DOMAIN.com`
4. Add a policy:
   - Name: `Only me`, Action: **Allow**
   - Include rule: selector **Emails**, value `you@example.com` (your exact address)
5. Under login methods for the application, allow **One-time PIN**. Save the application.
6. Open the application again and copy its **Application Audience (AUD) Tag**.
7. Put both values in [wrangler.jsonc](wrangler.jsonc):

   ```jsonc
   "vars": { "TEAM_NAME": "your-team-name", "ACCESS_AUD": "paste-the-aud-tag" }
   ```

8. Deploy again: `npm run deploy`.

Visiting `https://journal.YOUR-DOMAIN.com` now asks for your email, sends a one-time PIN, and then
opens the app. Every `/api/*` request is additionally verified in the Worker: the
`Cf-Access-Jwt-Assertion` signature, the issuer (`https://<TEAM_NAME>.cloudflareaccess.com`) and the AUD.

## 7. Test that a different email is blocked

1. Open a private/incognito window and go to `https://journal.YOUR-DOMAIN.com`.
2. Enter an email that is **not** in the policy. Cloudflare shows “That account does not have access”
   (no PIN is ever delivered to a non-listed address).
3. Also check the API directly with no login:

   ```bash
   curl -i https://journal.YOUR-DOMAIN.com/api/trades?from=2026-01-01\&to=2026-12-31
   ```

   You should get a redirect to the Access login (or `401` if the request reaches the Worker). Never `200`.
4. Confirm the old URLs are gone: `https://trade-journal.<your-subdomain>.workers.dev` should not respond.

## Local development notes

- `npm run dev` uses `.dev.vars` with `DEV_BYPASS_AUTH=true`. That file is git-ignored and is never
  uploaded. Do **not** add `DEV_BYPASS_AUTH` to `wrangler.jsonc` or to dashboard variables. Even if
  it were set in production, the Worker only honours it when the request host is `localhost`.
- `npm run build` strips any `.dev.vars` copied into `dist/` and fails if `DEV_BYPASS_AUTH` appears in the deploy config.
- To run the same migrations locally: `npm run db:migrate:local` (done automatically by `npm run dev`).

## Backups

Use **Settings → Export backup** regularly. The JSON file includes screenshots and can be restored with
**Import backup**. Cloudflare D1 also supports Time Travel restore for the last 30 days:
`npx wrangler d1 time-travel info trade-journal`.

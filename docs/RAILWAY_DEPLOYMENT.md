# OrbitHR production deployment

Production URL: `https://hr.balajione.dev`

## Railway application variables

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_ACCESS_SECRET=<new random value of at least 32 characters>
JWT_ISSUER=orbithr-api
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=30
APP_URL=https://hr.balajione.dev
WEB_APP_URL=https://hr.balajione.dev
RESEND_API_KEY=<new Resend key>
EMAIL_FROM=OrbitHR <onboarding@mail.balajione.dev>
ANDROID_APP_DOWNLOAD_URL=<public release APK URL>
HR_SUPPORT_EMAIL=hr@balajione.dev
```

Railway supplies `PORT`; do not define it manually. `railway.json` builds the web client,
generates Prisma Client, starts Express, and checks
`/api/health`. Express serves both the API and the Vite `dist` directory, including the
SPA fallback required for `/activate?token=...`.

Use Supabase's IPv4-compatible pooler URL for `DATABASE_URL`. Transaction mode on port
`6543` should include `?pgbouncer=true&connection_limit=1`. Database schema changes are
deployed separately with `npm run db:push`; they are not performed on every container restart.

## DNS

Add `hr.balajione.dev` as the Railway service custom domain. Copy both the CNAME and
ownership TXT records Railway displays into Cloudflare. Use DNS-only mode until Railway
has verified the hostname and issued TLS.

Verify `mail.balajione.dev` in Resend and copy its SPF, DKIM, and return-path records into
Cloudflare. The `EMAIL_FROM` domain must exactly match the domain verified in Resend.

## Android

Set this in `android-app/gradle.properties` before producing a signed release:

```properties
ORBIT_API_BASE_URL=https://hr.balajione.dev/api/v1/
```

Upload the signed APK to a public release host and set its URL as
`ANDROID_APP_DOWNLOAD_URL`. The local debug APK is intentionally excluded from Git.

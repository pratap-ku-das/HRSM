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
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<restricted IAM access key>
AWS_SECRET_ACCESS_KEY=<restricted IAM secret>
REKOGNITION_COLLECTION_ID=orbithr-production
FACE_MATCH_THRESHOLD=95
```

Railway supplies `PORT`; do not define it manually. `railway.json` builds the web client,
generates Prisma Client, starts Express, and checks
`/api/health`. Express serves both the API and the Vite `dist` directory, including the
SPA fallback required for `/activate?token=...`.

Use Supabase's IPv4-compatible pooler URL for `DATABASE_URL`. Transaction mode on port
`6543` should include `?pgbouncer=true&connection_limit=1`. Database schema changes are
deployed separately with `npm run db:push`; they are not performed on every container restart.

The IAM identity used for employee-specific face attendance needs only Rekognition
`CreateCollection`, `DescribeCollection`, `IndexFaces`, `SearchFacesByImage`, and
`DeleteFaces`. Do not use an AWS root access key. HR/Admin enrollment photos and live
selfies are processed in memory; OrbitHR stores only the provider face ID, match score,
short-lived verification state, and audit evidence.

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

Build the signed APK with the live API URL and place it at
`public/downloads/OrbitHR.apk`. The application serves it directly from
`https://hr.balajione.dev/downloads/orbithr-android.apk`.

### Publish from the local Windows computer

GitHub Actions is not required. Keep `android-app/orbithr-release.jks` and
`android-app/keystore.properties` on the authorized build computer, then run:

```powershell
.\scripts\publish-android.cmd
```

The script detects Android changes, increments the version, builds the release,
verifies that it is signed by the permanent BalajiOne certificate, replaces the
public APK, commits the exact release files, and pushes `main`. Railway then
publishes the APK at the existing download URL. It refuses to publish a debug-
signed or differently signed APK.

For an intentional rebuild of a specific version without committing or pushing:

```powershell
.\scripts\publish-android.cmd -VersionCode 5 -VersionName 1.1.0 -Force -NoCommit -NoPush
```

### Automatic Android publishing

`.github/workflows/android-release.yml` rebuilds and publishes the APK whenever
files under `android-app/` change on `main`. Each CI build receives an increasing
version code, replaces `public/downloads/OrbitHR.apk`, and pushes that artifact so
Railway redeploys the same permanent download URL.

Configure these GitHub Actions repository secrets before running the workflow:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded release keystore
- `ANDROID_KEYSTORE_PASSWORD`: keystore password
- `ANDROID_KEY_ALIAS`: release key alias
- `ANDROID_KEY_PASSWORD`: release key password

Use the same release key permanently. Changing it prevents Android from installing
future builds as updates over an already installed version.

# OrbitHR release runbook

Production migrations, external provider activation, signing-secret rotation, deployment, and public APK publishing are explicit operator actions. Never commit a keystore, passwords, biometric material, push tokens, payroll bank data, or `.env` files.

## Database release

1. Back up production PostgreSQL and verify restore access.
2. Review each directory under `prisma/migrations` in timestamp order.
3. Set `DATABASE_URL` only in the deployment secret store.
4. Run `npx prisma migrate deploy` from an approved release job.
5. Run health, role, and tenant-isolation smoke tests before enabling traffic.

## Required secrets

- `JWT_ACCESS_SECRET`: at least 32 unpredictable characters.
- `MFA_ENCRYPTION_KEY`: exactly 32 random bytes, base64 encoded and securely backed up.
- Approved face and email provider credentials.

Email/push notifications remain queued until a reviewed provider adapter is authorized. Activation must explicitly approve which provider receives employee addresses, device tokens, and message content.

## Android signing

`android-app/signing-backup-new-key-unused/orbithr-new-unused.jks` is a newly generated future key and is intentionally not activated automatically. Move it to encrypted offline storage before production use and keep its password file separate.

An update installs over an existing Android app only when its application ID and signing certificate match. If an installed build used the unavailable Balajione key, uninstall it once before installing a new-key build; local app data will be removed.

## Verification

```powershell
npx prisma validate
npx prisma generate
npx tsc -b --pretty false
npm test -- --run
npm run lint
npm run build
```

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME='C:\Users\prata\AppData\Local\Android\Sdk'
Set-Location android-app
.\gradlew.bat :app:compileDebugKotlin --no-daemon --console=plain
```

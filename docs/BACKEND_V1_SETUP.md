# OrbitHR Backend v1 Setup

## Environment

Copy `.env.example` to `.env` locally and supply real secret values. Generate `JWT_ACCESS_SECRET` using a cryptographically secure random generator with at least 32 bytes. Set the Resend key only in the server deployment secret manager.

`ANDROID_APP_DOWNLOAD_URL` controls the link in employee onboarding emails. It may point to a hosted internal APK/testing URL initially and a Google Play URL later without changing application code.

## Database

Apply the committed Prisma migration in deployment:

```shell
npx prisma migrate deploy
npx prisma generate
```

The migration adds user verification/token versioning, rotating refresh tokens, activation/reset tokens, tracked email delivery/retry state, and idempotency records.

## Local run

```shell
npm install
npm run server
```

The legacy web API remains under `/api`. Android uses `/api/v1`. The formal contract is `openapi/orbithr-v1.yaml`.

## Resend

Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_FROM_NAME` in server-only environment configuration. Verify the sending domain in Resend. Employee creation commits before email delivery begins; failures update `EmailDelivery` to `FAILED` with a backoff timestamp and do not roll back the employee.

## Deployment

- Terminate TLS at a trusted ingress and do not expose PostgreSQL publicly.
- Run `prisma migrate deploy` as a one-off release job.
- Supply environment secrets from the hosting platform, not an image or repository.
- Run at least two API instances only after introducing a durable email retry worker/queue.
- Restrict CORS to deployed web origins.
- Forward trusted client IP headers only from the load balancer.
- Monitor auth failures, refresh reuse, onboarding delivery failure, and tenant authorization denials.

## API changes

- Added standardized `{data, meta}` success and `{error, meta}` failure envelopes.
- Added request IDs, auth throttling, validation, access/refresh tokens, and server-derived tenant identity.
- Added self-service routes and server-time attendance punch.
- Added permission-scoped employee list/onboarding and onboarding resend.
- Retained existing routes for web compatibility.

## Known limitations

- The legacy web UI still uses localStorage in many modules and must be migrated incrementally to v1.
- Password-reset token creation exists, but password-reset email delivery needs a dedicated template/queue connection.
- Email retry timestamps are stored, but no scheduled backend worker consumes them yet.
- Secure file upload/download, FCM device registration, leave balances, manager approval APIs, and payslip PDF streaming remain to be implemented.
- Advanced biometric attendance is intentionally not advertised or implemented.

# OrbitHR Android push notifications

The application code is complete, but Firebase Cloud Messaging requires a one-time Firebase project connection before production push can work.

## 1. Connect the Android app

1. Open Firebase Console and create or select a project.
2. Add an Android app with package name `com.orbithr.app`.
3. Download `google-services.json`.
4. Place it at `android-app/app/google-services.json`.

The file is intentionally ignored by Git. Keep it in the protected deployment/build environment.

## 2. Configure the server sender

In Firebase Console, open **Project settings > Service accounts**, generate a private key, and store it on the production server. The preferred configuration is one base64 value:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("firebase-service-account.json"))
```

Set the output as `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` in the EC2 production `.env`. Do not commit the JSON or base64 value.

Alternatively set all three values:

```dotenv
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-...@your-project-id.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## 3. Deploy

Run the normal database migration, backend/web deployment, and signed Android build. Migration `20261001170000_push_device_app_version` records the installed app version for targeted update alerts. Increase the Android and server release versions only when the new signed APK is uploaded.

After an employee signs in, OrbitHR automatically registers and refreshes the FCM token. Signing out disables that device token. The server checks queued push notifications every 15 seconds and retries transient failures.

## Notification behavior

- Clock-in and clock-out open Attendance.
- Leave and expense decisions open the matching employee screen.
- Approval requests open Approval Inbox.
- Published payslips open Pay.
- Document and probation reminders open the relevant workspace/profile.
- App-release alerts are sent only to devices with an older version.

Android users must allow notifications when prompted. They can control Attendance, Approvals, Payroll, Updates, Security, and General independently in Android notification settings.

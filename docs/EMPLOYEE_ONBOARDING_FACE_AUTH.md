# Employee onboarding and face attendance

The successful production path has five explicit phases. A profile being created does not by itself mean that mobile face attendance is ready.

## 1. Organization readiness

- Create the employee department and a designation in that department.
- Configure an attendance location and geofence when on-site attendance requires one.
- Confirm the operator has `employee.manage`; face enrollment also requires `face.enroll`.

## 2. Employee and portal account

- HR onboards the employee from web or Android.
- The API creates the employee, portal user, one-time activation token, pending email delivery, idempotency record, and audit event in one transaction.
- Android keeps the form open when the API rejects it and only reports success after the server returns the created employee.

## 3. Account activation

- The email provider sends the activation link and temporary password asynchronously.
- HR can resend activation from the web employee directory while the account remains inactive.
- Resending invalidates older unused activation links. It is rejected after account activation; active employees use password reset instead.

## 4. HR-approved face enrollment

- In the web employee directory, open **Face setup**, choose a clear JPEG/PNG under 5 MB, confirm employee consent, and enroll.
- The server sends the image to AWS Rekognition and stores only the provider face identifier and audit metadata; it does not retain the raw image.
- Required runtime configuration: an AWS region and credentials permitted to create/describe the configured collection and index/search/delete faces. See `RAILWAY_DEPLOYMENT.md`.

## 5. Android attendance verification

- The employee signs in to the activated account.
- Android obtains a server challenge, performs a blink liveness capture, obtains fresh precise GPS, and submits the live image.
- The server matches the image to that employee's enrolled face and returns a 60-second, single-use proof bound to employee, action, and device.
- Clock-in/out consumes that proof and enforces geofence and attendance-state rules.

## Acceptance checks

1. Onboard a new employee and confirm the web UI shows profile created, activation queued, and face enrollment pending.
2. Activate the account and confirm a second activation resend returns `ACCOUNT_ALREADY_ACTIVE`.
3. Enroll the employee face and confirm the web status shows enrolled.
4. On Android, verify the wrong face is rejected and the enrolled face succeeds.
5. Confirm a proof cannot be reused, cannot switch clock-in to clock-out, and expires after 60 seconds.
6. Confirm attendance records show source `MOBILE_FACE`, `faceAuthVerified=true`, similarity, device, and location.

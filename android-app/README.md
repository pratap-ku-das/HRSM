# OrbitHR Native Android

Native Kotlin/Jetpack Compose client for the shared OrbitHR `/api/v1` backend. It does not contain a backend or authoritative demo data.

## Requirements

- Android Studio compatible with Android Gradle Plugin 9.2
- JDK 17 or the JDK bundled with Android Studio
- Android SDK 37
- A migrated/running OrbitHR backend

## Configure

Create `~/.gradle/gradle.properties` or pass a Gradle property:

```properties
ORBIT_API_BASE_URL=https://api.your-domain.example/api/v1/
```

The trailing slash is required. The default `http://10.0.2.2:3001/api/v1/` is only for an Android emulator talking to the local backend. No API secret belongs in the app.

## Build

Open `android-app/` in Android Studio, allow Gradle sync, then run:

```shell
./gradlew testDebugUnitTest lintDebug assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. A release build requires a private signing key configured outside version control.

## Architecture

- Compose/Material 3 UI and Navigation Compose
- Hilt dependency injection
- ViewModel, Coroutines, and StateFlow
- Retrofit/OkHttp with synchronized rotating-token authenticator
- Android Keystore AES-GCM encryption for the persisted refresh credential
- Room cache schema and WorkManager sync foundation
- Permission-driven employee/manager navigation

Connected workflows are login/session restoration, dashboard, server-time attendance punch/history, leave list/application, payslips, expenses, profile, employee directory, and employee onboarding. Unsupported file upload, notification registration, assets, goals, and document APIs are explicitly unavailable rather than backed by mock data.

## Google Play preparation

1. Replace the application ID only before the first Play upload if required.
2. Add adaptive launcher artwork and production branding assets.
3. Configure a release signing key through CI secret storage.
4. Build an Android App Bundle with `bundleRelease`.
5. Complete Data Safety declarations for employee, financial, location, and authentication data.
6. Publish privacy/support pages and add their URLs to the store listing.
7. Use internal testing first and set backend `ANDROID_APP_DOWNLOAD_URL` to that Play testing URL.
8. Run pre-launch, accessibility, security, and device compatibility reports.

## Current build environment limitation

The repository workstation did not expose Java, Gradle, the Android SDK, or adb on `PATH` when this project was created. Install/open with Android Studio before expecting Gradle or APK output.

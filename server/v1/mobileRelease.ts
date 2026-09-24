import { Router } from "express";

export const androidRelease = Object.freeze({
  versionCode: 14,
  versionName: "1.1.9",
  downloadUrl:
    "https://hr.balajione.dev/downloads/orbithr-android.apk?v=1.1.9-14",
  releaseNotes:
    "Staged employee onboarding and controlled payroll processing with attendance review, approval, payslip generation and publication.",
  publishedAt: "2026-09-24",
});

export function createMobileReleaseRouter() {
  const router = Router();
  router.get("/mobile/android-release", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ data: androidRelease, meta: {} });
  });
  return router;
}

import { Router } from "express";

export const androidRelease = Object.freeze({
  versionCode: 28,
  versionName: "1.4.8",
  downloadUrl:
    "https://hr.balajione.dev/downloads/OrbitHR.apk",
  releaseNotes:
    "Native Payslip & Form 16 PDF Viewer with pinch-to-zoom and offline ephemeral security, My Assets self-service acknowledgement and return workflows, and ATS candidate conversion.",
  publishedAt: "2026-10-02",
});

export function createMobileReleaseRouter() {
  const router = Router();
  router.get("/mobile/android-release", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ data: androidRelease, meta: {} });
  });
  return router;
}

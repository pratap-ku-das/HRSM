import { Router } from "express";

export const androidRelease = Object.freeze({
  versionCode: 28,
  versionName: "1.4.8",
  downloadUrl:
    "https://hr.balajione.dev/downloads/OrbitHR.apk",
  sha256:
    "c426c957406470587fbb369b353785bce482b31d3f54c20375fd21ab506264fb",
  fileSizeBytes: 55418320,
  minSupportedVersionCode: 1,
  mandatory: false,
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

import { Router } from "express";

export const androidRelease = Object.freeze({
  versionCode: 11,
  versionName: "1.1.6",
  downloadUrl:
    "https://hr.balajione.dev/downloads/orbithr-android.apk?v=1.1.6-11",
  releaseNotes:
    "Automatic update alerts, role-aware workspaces, and attendance improvements.",
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
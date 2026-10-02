import { Router } from "express";

export const androidRelease = Object.freeze({
  versionCode: 27,
  versionName: "1.4.7",
  downloadUrl:
    "https://hr.balajione.dev/downloads/OrbitHR.apk",
  releaseNotes:
    "Attendance re-clock-in support, streamlined punch flow, single-row analytics, and optimized GPS workday route tracking.",
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

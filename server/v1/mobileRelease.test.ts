import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  androidRelease,
  createMobileReleaseRouter,
} from "./mobileRelease.js";

describe("Android release metadata", () => {
  it("publishes the signed OrbitHR release without authentication", async () => {
    const app = express();
    app.use("/api/v1", createMobileReleaseRouter());

    const response = await request(app).get("/api/v1/mobile/android-release");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data).toEqual(androidRelease);
    expect(response.body.data.versionCode).toBe(11);
    expect(response.body.data.downloadUrl).toMatch(/^https:\/\//);
  });
});
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import type { PrismaClient } from "@prisma/client";
import { androidRelease } from "./mobileRelease.js";
import { emitNotification } from "./notifications.js";
import { runComplianceReminders } from "./reminders.js";
import { reconcileMidnightAbsentMissingClockOut } from "./attendancePolicies.js";

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

function firebaseMessaging(): Messaging | null {
  if (getApps().length) return getMessaging();
  try {
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
    if (encoded) {
      const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      initializeApp({ credential: cert(credentials) });
      return getMessaging();
    }
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
    if (projectId && clientEmail && privateKey) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
      return getMessaging();
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({ credential: applicationDefault() });
      return getMessaging();
    }
  } catch (error) {
    console.error("Firebase push initialization failed.", error instanceof Error ? error.message : error);
  }
  return null;
}

function channelFor(eventKey: string) {
  if (eventKey.startsWith("ATTENDANCE_")) return "attendance";
  if (eventKey.includes("APPROVAL") || eventKey.startsWith("LEAVE_") || eventKey.startsWith("EXPENSE_")) return "approvals";
  if (eventKey.startsWith("PAYROLL_") || eventKey.startsWith("PAYSLIP_")) return "payroll";
  if (eventKey === "APP_UPDATE_AVAILABLE") return "updates";
  if (eventKey.startsWith("SECURITY_") || eventKey.startsWith("MFA_")) return "security";
  return "general";
}

export async function processPushDeliveries(prisma: PrismaClient, messaging: Messaging, limit = 50) {
  const due = await prisma.notificationDelivery.findMany({
    where: {
      channel: "PUSH",
      status: { in: ["PENDING", "FAILED"] },
      attemptCount: { lt: 6 },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    include: { notification: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  for (const delivery of due) {
    const leaseUntil = new Date(Date.now() + 60_000);
    const claimed = await prisma.notificationDelivery.updateMany({
      where: { id: delivery.id, status: delivery.status, attemptCount: delivery.attemptCount },
      data: { attemptCount: { increment: 1 }, nextAttemptAt: leaseUntil },
    });
    if (!claimed.count) continue;
    const devices = await prisma.pushDevice.findMany({
      where: { companyId: delivery.companyId, userId: delivery.notification.userId, active: true },
      select: { token: true, tokenHash: true },
      take: 500,
    });
    if (!devices.length) {
      await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: "SKIPPED", lastError: "No active Android device is registered." } });
      continue;
    }
    try {
      const notification = delivery.notification;
      const response = await messaging.sendEachForMulticast({
        tokens: devices.map((device) => device.token),
        notification: { title: notification.title, body: notification.body },
        data: {
          notificationId: notification.id,
          eventKey: notification.eventKey,
          entityType: notification.entityType || "",
          entityId: notification.entityId || "",
          actionUrl: notification.actionUrl || "/notifications",
        },
        android: {
          priority: "high",
          notification: { channelId: channelFor(notification.eventKey), icon: "ic_orbithr_launcher", tag: notification.id },
        },
      });
      const invalidHashes = response.responses.flatMap((item, index) =>
        item.error && INVALID_TOKEN_CODES.has(item.error.code) ? [devices[index].tokenHash] : [],
      );
      if (invalidHashes.length) await prisma.pushDevice.updateMany({ where: { tokenHash: { in: invalidHashes } }, data: { active: false } });
      if (response.successCount > 0) {
        await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", sentAt: new Date(), providerId: response.responses.find((item) => item.success)?.messageId, lastError: null, nextAttemptAt: null } });
      } else {
        const message = response.responses.map((item) => item.error?.message).filter(Boolean).join("; ").slice(0, 1000) || "Firebase rejected all registered devices.";
        const exhausted = delivery.attemptCount + 1 >= 6;
        await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: exhausted ? "SKIPPED" : "FAILED", lastError: message, nextAttemptAt: exhausted ? null : new Date(Date.now() + 2 ** Math.min(delivery.attemptCount + 1, 6) * 60_000) } });
      }
    } catch (error) {
      const exhausted = delivery.attemptCount + 1 >= 6;
      await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: exhausted ? "SKIPPED" : "FAILED", lastError: (error instanceof Error ? error.message : String(error)).slice(0, 1000), nextAttemptAt: exhausted ? null : new Date(Date.now() + 2 ** Math.min(delivery.attemptCount + 1, 6) * 60_000) } });
    }
  }
  return due.length;
}

async function queueAndroidReleaseNotifications(prisma: PrismaClient) {
  const devices = await prisma.pushDevice.findMany({ where: { active: true, platform: "ANDROID", OR: [{ appVersionCode: null }, { appVersionCode: { lt: androidRelease.versionCode } }] }, distinct: ["userId"], select: { companyId: true, userId: true } });
  const entityId = String(androidRelease.versionCode);
  for (const device of devices) {
    const exists = await prisma.notification.findFirst({ where: { companyId: device.companyId, userId: device.userId, eventKey: "APP_UPDATE_AVAILABLE", entityType: "AndroidRelease", entityId }, select: { id: true } });
    if (!exists) await emitNotification(prisma, { companyId: device.companyId, userId: device.userId, eventKey: "APP_UPDATE_AVAILABLE", title: `OrbitHR ${androidRelease.versionName} is available`, body: androidRelease.releaseNotes, entityType: "AndroidRelease", entityId, actionUrl: androidRelease.downloadUrl });
  }
}

async function runAutomaticReminders(prisma: PrismaClient) {
  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const company of companies) await runComplianceReminders(prisma, company.id);
}

export function startNotificationWorkers(prisma: PrismaClient) {
  const messaging = firebaseMessaging();
  if (!messaging) console.warn("Firebase push is disabled: configure FIREBASE service-account credentials.");
  let pushRunning = false;
  const push = async () => {
    if (!messaging || pushRunning) return;
    pushRunning = true;
    try { await processPushDeliveries(prisma, messaging); } catch (error) { console.error("Push delivery worker failed.", error); } finally { pushRunning = false; }
  };
  void queueAndroidReleaseNotifications(prisma).catch((error) => console.error("Update notification queue failed.", error));
  void runAutomaticReminders(prisma).catch((error) => console.error("Automatic reminder job failed.", error));
  void reconcileMidnightAbsentMissingClockOut(prisma).catch((error) => console.error("Midnight absent auto-reconciliation failed.", error));
  const pushTimer = setInterval(() => void push(), 15_000);
  const reminderTimer = setInterval(() => void runAutomaticReminders(prisma).catch((error) => console.error("Automatic reminder job failed.", error)), 6 * 60 * 60_000);
  const midnightAbsentTimer = setInterval(() => void reconcileMidnightAbsentMissingClockOut(prisma).catch((error) => console.error("Midnight absent auto-reconciliation failed.", error)), 15 * 60_000);
  pushTimer.unref(); reminderTimer.unref(); midnightAbsentTimer.unref();
  setTimeout(() => void push(), 2_000).unref();
  return () => { clearInterval(pushTimer); clearInterval(reminderTimer); clearInterval(midnightAbsentTimer); };
}

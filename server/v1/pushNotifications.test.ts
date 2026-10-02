import { describe, expect, it, vi } from "vitest";
import { processPushDeliveries } from "./pushNotifications.js";

describe("push delivery worker", () => {
  it("sends a queued notification and records successful delivery", async () => {
    const delivery = {
      id: "delivery-1",
      companyId: "company-1",
      status: "PENDING",
      attemptCount: 0,
      notification: {
        id: "notification-1",
        userId: "user-1",
        eventKey: "LEAVE_APPROVED",
        title: "Leave approved",
        body: "Your leave request was approved.",
        entityType: "LeaveRequest",
        entityId: "leave-1",
        actionUrl: "/leave",
      },
    };
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      notificationDelivery: {
        findMany: vi.fn().mockResolvedValue([delivery]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update,
      },
      pushDevice: {
        findMany: vi.fn().mockResolvedValue([{ token: "valid-device-token", tokenHash: "hash-1" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const sendEachForMulticast = vi.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true, messageId: "firebase-message-1" }],
    });

    await processPushDeliveries(prisma as never, { sendEachForMulticast } as never);

    expect(sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({
      tokens: ["valid-device-token"],
      data: expect.objectContaining({ notificationId: "notification-1", actionUrl: "/leave" }),
      android: expect.objectContaining({ notification: expect.objectContaining({ channelId: "approvals" }) }),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "delivery-1" },
      data: expect.objectContaining({ status: "SENT", providerId: "firebase-message-1" }),
    }));
  });
});

import type { Request, Response } from "express";
import mongoose, { Schema, model } from "mongoose";
import { createHeartbeatJob, deleteHeartbeatJob } from "./_core/heartbeat";
import { sdk } from "./_core/sdk";
import { Booking, Notification, getArenaHubDatabase } from "./arenahub";

const bookingReminderScheduleSchema = new Schema({
  bookingId: { type: String, required: true, unique: true, index: true },
  scheduleCronTaskUid: { type: String, required: true, unique: true, index: true },
  reminderSentAt: { type: Date },
}, { timestamps: true });

const BookingReminderSchedule = mongoose.models.BookingReminderSchedule || model("BookingReminderSchedule", bookingReminderScheduleSchema);

function cronAt(date: Date) {
  return `0 ${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;
}

export async function scheduleUpcomingBookingReminder(booking: { _id: { toString(): string }; reference: string; slotStart: Date }) {
  const bookingId = booking._id.toString();
  const existing = await BookingReminderSchedule.findOne({ bookingId }).lean();
  if (existing) return { scheduled: true, taskUid: existing.scheduleCronTaskUid };

  const reminderAt = new Date(booking.slotStart.getTime() - 30 * 60 * 1000);
  if (reminderAt.getTime() <= Date.now()) return { scheduled: false, reason: "booking-starts-too-soon" };

  const job = await createHeartbeatJob({
    name: `arenahub-booking-${bookingId}`,
    cron: cronAt(reminderAt),
    path: "/api/scheduled/booking-reminder",
    payload: { bookingReference: booking.reference },
    description: `One-time 30-minute reminder for ArenaHub booking ${booking.reference}`,
  }, "");
  await BookingReminderSchedule.create({ bookingId, scheduleCronTaskUid: job.taskUid });
  return { scheduled: true, taskUid: job.taskUid };
}

/**
 * Sends one in-app reminder for a confirmed booking. The scheduled identity,
 * not the request body, identifies the booking to keep the handler idempotent.
 */
export async function sendUpcomingBookingReminder(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });

    await getArenaHubDatabase();
    const schedule = await BookingReminderSchedule.findOne({ scheduleCronTaskUid: user.taskUid });
    if (!schedule) {
      await deleteHeartbeatJob(user.taskUid, "");
      return res.json({ ok: true, skipped: "orphaned-reminder" });
    }
    const booking = await Booking.findById(schedule.bookingId);
    if (!booking) {
      await deleteHeartbeatJob(user.taskUid, "");
      return res.json({ ok: true, skipped: "missing-booking" });
    }

    if (schedule.reminderSentAt || booking.status !== "CONFIRMED") {
      await deleteHeartbeatJob(user.taskUid, "");
      return res.json({ ok: true, skipped: "already-sent-or-no-longer-confirmed" });
    }

    await Notification.create({
      recipientOpenId: booking.playerOpenId,
      kind: "BOOKING_UPDATE",
      title: "Your booked court starts soon",
      body: `Booking ${booking.reference} begins at ${booking.slotStart.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`,
      href: "/dashboard",
    });
    schedule.reminderSentAt = new Date();
    await schedule.save();
    await deleteHeartbeatJob(user.taskUid, "");
    return res.json({ ok: true, bookingReference: booking.reference });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected booking reminder failure";
    return res.status(500).json({ error: message, timestamp: new Date().toISOString(), context: { url: req.originalUrl } });
  }
}

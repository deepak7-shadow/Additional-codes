import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { z } from "zod";
import { storageGet, storagePut } from "./storage";
import { createReceiptForBooking } from "./receipt";
import { scheduleUpcomingBookingReminder } from "./bookingReminder";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { Arena, ArenaDocument, Booking, Court, DEFAULT_COURT_AVAILABILITY, Equipment, Notification, Profile, Review, WebhookEvent, calculateBookingSubtotal, canOwnerAccessArenaRecord, canTransitionArenaStatus, getArenaHubDatabase, getOwnerArenaUpdateDecision, getPostSubmissionDocumentDecision, getReviewSubmissionDecision, isCourtSlotAvailable, isWithinCourtAvailability, makeBookingReference, toOwnerArenaRecordPayload, toPlayerReviewStatusPayload, type ArenaHubRole } from "./arenahub";
import { canApproveArenaOperations, DESIGNATED_APPROVAL_ADMIN_EMAIL } from "./approvalAuthorization";
import { getEmailProfileConflictError, getRoleActivationError } from "./profileRolePolicy";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";

const validId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record identifier");
const approvedArena = { status: "APPROVED", verificationStatus: "APPROVED" } as const;

async function connected() {
  const connection = await getArenaHubDatabase();
  if (!connection) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ArenaHub is not connected to MongoDB Atlas yet. Add MONGODB_URI before creating or reading live platform data." });
}

async function requireProfile(openId: string, role: Exclude<ArenaHubRole, "ADMIN">) {
  await connected();
  const profile = await Profile.findOne({ openId }).lean();
  if (!profile || profile.role !== role || !profile.active) throw new TRPCError({ code: "FORBIDDEN", message: `This action is restricted to active ${role === "OWNER" ? "Arena Owners" : "Players"}.` });
  return profile;
}

function requireDesignatedApprovalAdmin(email: string | null | undefined) {
  if (!canApproveArenaOperations(email)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Only the designated ArenaHub approval administrator (${DESIGNATED_APPROVAL_ADMIN_EMAIL}) can approve, reject, or moderate marketplace records.`,
    });
  }
}

function parseIsoDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Provide a valid ISO date and time." });
  return parsed;
}

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before taking payments." });
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

async function notify(recipientOpenId: string, kind: "BOOKING_CONFIRMED" | "BOOKING_CANCELLED" | "PAYMENT_FAILED" | "ARENA_APPROVED" | "ARENA_REJECTED" | "DOCUMENT_APPROVED" | "DOCUMENT_REJECTED" | "BOOKING_UPDATE", title: string, body: string, href?: string) {
  return Notification.create({ recipientOpenId, kind, title, body, href });
}

export const arenaHubRouter = router({
  platform: router({
    readiness: publicProcedure.query(() => ({
      mongoConfigured: Boolean(process.env.MONGODB_URI),
      paymentsConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      webhooksConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      storageReady: true,
    })),
  }),
  profile: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const database = await getArenaHubDatabase();
      if (!database) return null;
      return Profile.findOne({ openId: ctx.user.openId }).lean();
    }),
    chooseRole: protectedProcedure.input(z.object({ role: z.enum(["PLAYER", "OWNER"]), displayName: z.string().trim().min(2).max(80) })).mutation(async ({ ctx, input }) => {
      await connected();
      if (ctx.user.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator accounts cannot self-activate Player or Arena Owner capabilities." });
      const normalizedEmail = ctx.user.email?.trim().toLowerCase() || undefined;
      const [currentProfile, emailProfile] = await Promise.all([
        Profile.findOne({ openId: ctx.user.openId }).lean(),
        normalizedEmail ? Profile.findOne({ email: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).lean() : Promise.resolve(null),
      ]);
      const activationError = getRoleActivationError(currentProfile?.role, input.role);
      if (activationError) throw new TRPCError({ code: "FORBIDDEN", message: activationError });
      const emailConflict = getEmailProfileConflictError(emailProfile?.openId, ctx.user.openId, normalizedEmail);
      if (emailConflict) throw new TRPCError({ code: "CONFLICT", message: emailConflict });
      return Profile.findOneAndUpdate(
        { openId: ctx.user.openId },
        { $set: { displayName: input.displayName, email: normalizedEmail, role: input.role }, $setOnInsert: { openId: ctx.user.openId, verificationStatus: "DRAFT", preferences: { sports: [] } } },
        { upsert: true, new: true },
      ).lean();
    }),
    savePreferences: protectedProcedure.input(z.object({ sports: z.array(z.string().trim().min(2).max(40)).max(8), latitude: z.number().optional(), longitude: z.number().optional() })).mutation(async ({ ctx, input }) => {
      await connected();
      return Profile.findOneAndUpdate({ openId: ctx.user.openId }, { $set: { preferences: input } }, { new: true }).lean();
    }),
  }),
  notifications: router({
    mine: protectedProcedure.query(async ({ ctx }) => { await connected(); return Notification.find({ recipientOpenId: ctx.user.openId }).sort({ createdAt: -1 }).limit(30).lean(); }),
    markRead: protectedProcedure.input(z.object({ notificationId: validId })).mutation(async ({ ctx, input }) => {
      await connected();
      return Notification.findOneAndUpdate({ _id: input.notificationId, recipientOpenId: ctx.user.openId }, { $set: { readAt: new Date() } }, { new: true }).lean();
    }),
  }),
  discovery: router({
    search: publicProcedure.input(z.object({ sport: z.string().optional(), city: z.string().optional(), maxHourlyPrice: z.number().positive().optional() }).optional()).query(async ({ input }) => {
      const database = await getArenaHubDatabase();
      if (!database) return [];
      const filters: Record<string, unknown> = { ...approvedArena };
      if (input?.sport) filters.sports = input.sport;
      if (input?.city) filters["location.city"] = new RegExp(input.city, "i");
      const arenas = await Arena.find(filters).sort({ updatedAt: -1 }).lean();
      const courts = await Court.find({ arenaId: { $in: arenas.map(arena => arena._id) }, active: true }).lean();
      const byArena = new Map<string, typeof courts>();
      courts.forEach(court => byArena.set(court.arenaId.toString(), [...(byArena.get(court.arenaId.toString()) ?? []), court]));
      return arenas.map(arena => {
        const arenaCourts = byArena.get(arena._id.toString()) ?? [];
        const minHourlyPrice = arenaCourts.length ? Math.min(...arenaCourts.map(court => court.pricePerHour)) : null;
        return { ...arena, minHourlyPrice, courtCount: arenaCourts.length };
      }).filter(arena => !input?.maxHourlyPrice || (arena.minHourlyPrice !== null && arena.minHourlyPrice <= input.maxHourlyPrice));
    }),
    detail: publicProcedure.input(z.object({ arenaId: validId })).query(async ({ input }) => {
      const database = await getArenaHubDatabase();
      if (!database) return null;
      const arena = await Arena.findOne({ _id: input.arenaId, ...approvedArena }).lean();
      if (!arena) return null;
      const [courts, equipment, photos, reviews] = await Promise.all([
        Court.find({ arenaId: arena._id, active: true }).lean(),
        Equipment.find({ arenaId: arena._id, active: true }).lean(),
        ArenaDocument.find({ _id: { $in: arena.photoIds }, kind: "ARENA_PHOTO", status: "APPROVED" }).lean(),
        Review.find({ arenaId: arena._id, status: "APPROVED" }).sort({ createdAt: -1 }).limit(12).lean(),
      ]);
      return { arena, courts, equipment, photos: photos.map(photo => ({ id: photo._id.toString(), caption: photo.caption, url: `/manus-storage/${photo.storageKey}` })), reviews: reviews.map(review => ({ id: review._id.toString(), rating: review.rating, comment: review.comment, createdAt: review.createdAt })) };
    }),
    court: publicProcedure.input(z.object({ courtId: validId })).query(async ({ input }) => {
      const database = await getArenaHubDatabase();
      if (!database) return null;
      const court = await Court.findOne({ _id: input.courtId, active: true }).lean();
      if (!court) return null;
      const arena = await Arena.findOne({ _id: court.arenaId, ...approvedArena }).lean();
      if (!arena) return null;
      const equipment = await Equipment.find({ arenaId: arena._id, active: true }).lean();
      return { arena, court, equipment };
    }),
  }),
  recommendations: router({
    forPlayer: protectedProcedure.query(async ({ ctx }) => {
      const profile = await requireProfile(ctx.user.openId, "PLAYER");
      const [bookings, arenas] = await Promise.all([Booking.find({ playerOpenId: ctx.user.openId, status: { $in: ["CONFIRMED", "COMPLETED"] } }).lean(), Arena.find(approvedArena).sort({ updatedAt: -1 }).limit(60).lean()]);
      const sportSignals = new Set([...profile.preferences.sports, ...bookings.map(booking => booking.sport)]);
      const items = arenas.map(arena => {
        const sharedSports = arena.sports.filter(sport => sportSignals.has(sport));
        const distanceScore = profile.preferences.latitude !== undefined && profile.preferences.longitude !== undefined ? Math.max(0, 3 - Math.hypot(arena.location.latitude - profile.preferences.latitude, arena.location.longitude - profile.preferences.longitude) / 0.08) : 0;
        const score = sharedSports.length * 10 + distanceScore;
        return { arenaId: arena._id.toString(), name: arena.name, city: arena.location.city, sharedSports, score, reason: sharedSports.length ? `Matches your ${sharedSports.join(" and ")} activity.` : "A verified arena that expands your local options." };
      }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 6);
      return { items, hasSignals: sportSignals.size > 0, method: "Recommendations use saved sport preferences, confirmed booking sports, and optional saved coordinates. They never use invented ratings or fabricated activity." };
    }),
    explain: protectedProcedure.input(z.object({ arenaId: validId })).mutation(async ({ ctx, input }) => {
      const profile = await requireProfile(ctx.user.openId, "PLAYER");
      const [arena, bookings] = await Promise.all([Arena.findOne({ _id: input.arenaId, ...approvedArena }).lean(), Booking.find({ playerOpenId: ctx.user.openId, status: { $in: ["CONFIRMED", "COMPLETED"] } }).lean()]);
      if (!arena) throw new TRPCError({ code: "NOT_FOUND", message: "The requested verified arena was not found." });
      const facts = { arena: { name: arena.name, city: arena.location.city, sports: arena.sports }, savedSports: profile.preferences.sports, bookedSports: Array.from(new Set(bookings.map(booking => booking.sport))), locationSignal: profile.preferences.latitude !== undefined && profile.preferences.longitude !== undefined ? "The player has opted into saved location-based local ranking." : "The player has not saved location coordinates." };
      const { data: models } = await listLLMModels();
      const model = models.find(model => model.id === "gpt-5-mini")?.id;
      const result = await invokeLLM({ model, maxTokens: 100, messages: [{ role: "system", content: "Write one concise factual recommendation explanation. Use only supplied JSON. You may state that saved location is an opted-in local-ranking signal, but never state a distance or proximity. Do not claim reviews, ratings, availability, quality, or amenities not supplied. If there is no sport match, say it broadens verified local options." }, { role: "user", content: JSON.stringify(facts) }] });
      return { explanation: String(result.choices[0]?.message?.content ?? "This verified arena broadens your local sport options.").trim().slice(0, 420) };
    }),
  }),
  owner: router({
    myArenas: protectedProcedure.query(async ({ ctx }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      return Arena.find({ ownerOpenId: ctx.user.openId }).sort({ updatedAt: -1 }).lean();
    }),
    submitArena: protectedProcedure.input(z.object({ name: z.string().trim().min(3).max(120), description: z.string().trim().min(30).max(2000), sports: z.array(z.string().trim().min(2).max(40)).min(1).max(10), address: z.string().trim().min(8).max(240), city: z.string().trim().min(2).max(100), latitude: z.number().gte(-90).lte(90), longitude: z.number().gte(-180).lte(180) })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      return Arena.create({ ownerOpenId: ctx.user.openId, name: input.name, description: input.description, sports: input.sports, location: { address: input.address, city: input.city, latitude: input.latitude, longitude: input.longitude }, status: "PENDING", verificationStatus: "PENDING", photoIds: [] });
    }),
    updateArena: protectedProcedure.input(z.object({ arenaId: validId, name: z.string().trim().min(3).max(120), description: z.string().trim().min(30).max(2000), sports: z.array(z.string().trim().min(2).max(40)).min(1).max(10), address: z.string().trim().min(8).max(240), city: z.string().trim().min(2).max(100), latitude: z.number().gte(-90).lte(90), longitude: z.number().gte(-180).lte(180) })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      const { arenaId, ...updates } = input;
      const currentArena = await Arena.findById(arenaId).lean();
      if (!currentArena) throw new TRPCError({ code: "NOT_FOUND", message: "Arena not found." });
      const decision = getOwnerArenaUpdateDecision(currentArena.ownerOpenId, ctx.user.openId);
      if (!decision.allowed) throw new TRPCError({ code: decision.code, message: decision.message });
      const arena = await Arena.findByIdAndUpdate(arenaId, { $set: { name: updates.name, description: updates.description, sports: updates.sports, location: { address: updates.address, city: updates.city, latitude: updates.latitude, longitude: updates.longitude }, status: decision.nextStatus, verificationStatus: decision.nextVerificationStatus, rejectionReason: undefined } }, { new: true }).lean();
      if (!arena) throw new TRPCError({ code: "NOT_FOUND", message: "Arena not found." });
      return arena;
    }),
    arenaRecord: protectedProcedure.input(z.object({ arenaId: validId })).query(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      const arena = await Arena.findOne({ _id: input.arenaId }).lean();
      if (!arena || !canOwnerAccessArenaRecord(arena.ownerOpenId, ctx.user.openId)) throw new TRPCError({ code: "FORBIDDEN", message: "You can only view the full record for your own arena." });
      const [courts, equipment, documents, reviews, bookingCount] = await Promise.all([
        Court.find({ arenaId: arena._id }).sort({ createdAt: -1 }).lean(),
        Equipment.find({ arenaId: arena._id }).sort({ createdAt: -1 }).lean(),
        ArenaDocument.find({ ownerOpenId: ctx.user.openId }).sort({ createdAt: -1 }).lean(),
        Review.find({ arenaId: arena._id }).sort({ createdAt: -1 }).lean(),
        Booking.countDocuments({ arenaId: arena._id, status: { $in: ["CONFIRMED", "COMPLETED"] } }),
      ]);
      return toOwnerArenaRecordPayload({
        arena,
        courts,
        equipment,
        documents: documents.map(document => ({
          ...document,
          download: { documentId: document._id.toString(), procedure: "documents.download" as const },
        })),
        reviews,
        bookingCount,
      });
    }),
    addCourt: protectedProcedure.input(z.object({ arenaId: validId, name: z.string().trim().min(2).max(100), sport: z.string().trim().min(2).max(40), pricePerHour: z.number().positive().max(100000), availability: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).refine(window => window.endMinute > window.startMinute, "Each operating window must end after it starts.")).min(1).max(14).optional() })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      const arena = await Arena.findOne({ _id: input.arenaId, ownerOpenId: ctx.user.openId }).lean();
      if (!arena) throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage courts for your own arenas." });
      return Court.create({ arenaId: arena._id, name: input.name, sport: input.sport, pricePerHour: input.pricePerHour, availability: input.availability ?? DEFAULT_COURT_AVAILABILITY, active: true });
    }),
    courts: protectedProcedure.input(z.object({ arenaId: validId })).query(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      const arena = await Arena.findOne({ _id: input.arenaId, ownerOpenId: ctx.user.openId }).lean();
      if (!arena) throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage courts for your own arenas." });
      return Court.find({ arenaId: arena._id }).sort({ createdAt: -1 }).lean();
    }),
    setCourtAvailability: protectedProcedure.input(z.object({ courtId: validId, availability: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).refine(window => window.endMinute > window.startMinute, "Each operating window must end after it starts.")).min(1).max(14) })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      const court = await Court.findById(input.courtId);
      if (!court) throw new TRPCError({ code: "NOT_FOUND", message: "Court not found." });
      const arena = await Arena.findOne({ _id: court.arenaId, ownerOpenId: ctx.user.openId }).lean();
      if (!arena) throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage courts for your own arenas." });
      court.availability = input.availability; await court.save(); return court;
    }),
    addEquipment: protectedProcedure.input(z.object({ arenaId: validId, name: z.string().trim().min(2).max(100), sport: z.string().trim().min(2).max(40), pricePerHour: z.number().min(0).max(100000), quantityAvailable: z.number().int().min(0).max(1000), condition: z.enum(["NEW", "GOOD", "FAIR"]) })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      const arena = await Arena.findOne({ _id: input.arenaId, ownerOpenId: ctx.user.openId }).lean();
      if (!arena) throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage equipment for your own arenas." });
      return Equipment.create({ ...input, arenaId: arena._id, photoIds: [], active: true });
    }),
    equipment: protectedProcedure.input(z.object({ arenaId: validId })).query(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      const arena = await Arena.findOne({ _id: input.arenaId, ownerOpenId: ctx.user.openId }).lean();
      if (!arena) throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage equipment for your own arenas." });
      return Equipment.find({ arenaId: arena._id }).sort({ createdAt: -1 }).lean();
    }),
    attachEquipmentPhoto: protectedProcedure.input(z.object({ equipmentId: validId, documentId: validId })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      const equipment = await Equipment.findById(input.equipmentId);
      const document = await ArenaDocument.findOne({ _id: input.documentId, ownerOpenId: ctx.user.openId, kind: "EQUIPMENT_PHOTO", status: "PENDING" });
      if (!equipment || !document) throw new TRPCError({ code: "NOT_FOUND", message: "Equipment or an eligible equipment photo was not found." });
      const arena = await Arena.findOne({ _id: equipment.arenaId, ownerOpenId: ctx.user.openId }).lean();
      if (!arena) throw new TRPCError({ code: "FORBIDDEN", message: "You can only attach media to your own equipment." });
      if (!equipment.photoIds.some(id => id.toString() === document._id.toString())) equipment.photoIds.push(document._id); await equipment.save(); return equipment;
    }),
  }),
  documents: router({
    upload: protectedProcedure.input(z.object({ kind: z.enum(["ARENA_PHOTO", "EQUIPMENT_PHOTO", "VERIFICATION_DOCUMENT"]), originalName: z.string().trim().min(1).max(180), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), base64: z.string().min(8), caption: z.string().trim().max(240).optional() })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "OWNER");
      const decision = getPostSubmissionDocumentDecision(ctx.user.openId, ctx.user.openId, input.kind);
      if (!decision.allowed) throw new TRPCError({ code: decision.code, message: decision.message });
      const bytes = Buffer.from(input.base64, "base64");
      const maxBytes = input.kind === "VERIFICATION_DOCUMENT" ? 12 * 1024 * 1024 : 8 * 1024 * 1024;
      if (bytes.length > maxBytes) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: `Files must be smaller than ${maxBytes / 1024 / 1024} MB.` });
      if (input.kind !== "VERIFICATION_DOCUMENT" && !input.mimeType.startsWith("image/")) throw new TRPCError({ code: "BAD_REQUEST", message: "Arena and equipment media must be a supported image." });
      const { key } = await storagePut(`arenahub/${ctx.user.openId}/${input.kind.toLowerCase()}/${input.originalName}`, bytes, input.mimeType);
      return ArenaDocument.create({ ownerOpenId: ctx.user.openId, kind: decision.kind, originalName: input.originalName, mimeType: input.mimeType, sizeBytes: bytes.length, storageKey: key, caption: input.caption, status: decision.nextStatus });
    }),
    mine: protectedProcedure.query(async ({ ctx }) => {
      await connected();
      const ownFiles = await ArenaDocument.find({ ownerOpenId: ctx.user.openId }).sort({ createdAt: -1 }).lean();
      const receiptBookings = await Booking.find({ playerOpenId: ctx.user.openId, receiptDocumentId: { $exists: true } }).select({ receiptDocumentId: 1 }).lean();
      const receiptIds = receiptBookings.flatMap(booking => booking.receiptDocumentId ? [booking.receiptDocumentId] : []);
      if (!receiptIds.length) return ownFiles;
      const receipts = await ArenaDocument.find({ _id: { $in: receiptIds }, kind: "RECEIPT" }).lean();
      return [...ownFiles, ...receipts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),
    download: protectedProcedure.input(z.object({ documentId: validId })).query(async ({ ctx, input }) => {
      await connected();
      const document = await ArenaDocument.findOne({ _id: input.documentId, ownerOpenId: ctx.user.openId }).lean() ?? await (async () => {
        const receiptBooking = await Booking.findOne({ receiptDocumentId: input.documentId, playerOpenId: ctx.user.openId }).lean();
        return receiptBooking ? ArenaDocument.findById(input.documentId).lean() : null;
      })();
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      return storageGet(document.storageKey);
    }),
  }),
  booking: router({
    quote: protectedProcedure.input(z.object({ courtId: validId, slotStart: z.string(), slotEnd: z.string(), equipment: z.array(z.object({ equipmentId: validId, quantity: z.number().int().min(1).max(10) })).max(12).default([]) })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "PLAYER");
      const court = await Court.findById(input.courtId).lean();
      const slotStart = parseIsoDate(input.slotStart);
      const slotEnd = parseIsoDate(input.slotEnd);
      if (!court || !court.active) throw new TRPCError({ code: "NOT_FOUND", message: "This court is not currently bookable." });
      if (slotEnd <= slotStart || slotStart <= new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a future time range with a valid end time." });
      if (!isWithinCourtAvailability(court, slotStart, slotEnd)) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a slot within this court’s configured operating hours." });
      if (!(await isCourtSlotAvailable(input.courtId, slotStart, slotEnd))) throw new TRPCError({ code: "CONFLICT", message: "This time slot has just been reserved. Choose another time." });
      const selected = input.equipment.length ? await Equipment.find({ _id: { $in: input.equipment.map(item => item.equipmentId) }, arenaId: court.arenaId, active: true }).lean() : [];
      if (selected.length !== input.equipment.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more selected rentals are unavailable for this court." });
      const rentals = input.equipment.map(item => {
        const equipment = selected.find(entry => entry._id.toString() === item.equipmentId);
        if (!equipment || item.quantity > equipment.quantityAvailable) throw new TRPCError({ code: "BAD_REQUEST", message: "Requested equipment quantity is unavailable." });
        return { equipmentId: equipment._id, quantity: item.quantity, unitPrice: equipment.pricePerHour };
      });
      const subtotal = calculateBookingSubtotal(court.pricePerHour, (slotEnd.getTime() - slotStart.getTime()) / 3_600_000, rentals);
      const booking = await Booking.create({ reference: makeBookingReference(), playerOpenId: ctx.user.openId, arenaId: court.arenaId, courtId: court._id, sport: court.sport, slotStart, slotEnd, equipment: rentals, subtotal, status: "PENDING_PAYMENT", payment: { status: "PENDING" } });
      return { bookingId: booking._id.toString(), reference: booking.reference, subtotal, currency: "INR", expiresInMinutes: 10 };
    }),
    mine: protectedProcedure.query(async ({ ctx }) => {
      await requireProfile(ctx.user.openId, "PLAYER");
      const bookings = await Booking.find({ playerOpenId: ctx.user.openId }).sort({ slotStart: -1 }).lean();
      const arenaIds = Array.from(new Set(bookings.map(booking => booking.arenaId.toString())));
      // Keep the player's booking and receipt history, but attach venue details only
      // while the venue remains approved for active marketplace use.
      const arenas = arenaIds.length ? await Arena.find({ _id: { $in: arenaIds }, ...approvedArena }).lean() : [];
      const arenaById = new Map(arenas.map(arena => [arena._id.toString(), arena]));
      return bookings.map(booking => {
        const arena = arenaById.get(booking.arenaId.toString());
        return {
          ...booking,
          arena: arena ? {
            id: arena._id.toString(),
            name: arena.name,
            location: arena.location,
          } : null,
        };
      });
    }),
    downloadDocument: protectedProcedure.input(z.object({ bookingId: validId })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "PLAYER");
      const booking = await Booking.findOne({ _id: input.bookingId, playerOpenId: ctx.user.openId, status: { $in: ["CONFIRMED", "COMPLETED"] }, "payment.status": "PAID" }).lean();
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "A confirmed paid booking was not found." });
      const receiptDocumentId = await createReceiptForBooking(booking._id.toString());
      if (!receiptDocumentId) throw new TRPCError({ code: "BAD_REQUEST", message: "A booking document is not available for this booking." });
      const document = await ArenaDocument.findById(receiptDocumentId).lean();
      if (!document || document.ownerOpenId !== ctx.user.openId) throw new TRPCError({ code: "NOT_FOUND", message: "Booking document not found." });
      const download = await storageGet(document.storageKey);
      return { ...download, fileName: document.originalName };
    }),
    cancel: protectedProcedure.input(z.object({ bookingId: validId, reason: z.string().trim().min(3).max(500).optional() })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "PLAYER");
      const booking = await Booking.findOne({ _id: input.bookingId, playerOpenId: ctx.user.openId, status: { $in: ["PENDING_PAYMENT", "CONFIRMED"] } });
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "An active booking was not found." });
      if (booking.slotStart.getTime() - Date.now() < 2 * 60 * 60 * 1000) throw new TRPCError({ code: "BAD_REQUEST", message: "Bookings can be cancelled up to two hours before the slot starts." });
      booking.status = "CANCELLED";
      if (booking.payment.paymentId && booking.payment.status === "PAID") {
        const refund = await getRazorpay().payments.refund(booking.payment.paymentId, { notes: { arenaHubBookingId: booking._id.toString(), reason: input.reason ?? "Player cancellation" } });
        booking.payment.refundId = refund.id;
      }
      await booking.save();
      await notify(ctx.user.openId, "BOOKING_CANCELLED", "Booking cancelled", booking.payment.refundId ? `Your ${booking.reference} booking is cancelled. The payment provider is processing the refund.` : `Your ${booking.reference} booking is cancelled and the court slot is available again.`, "/dashboard");
      return { bookingId: booking._id.toString(), status: booking.status, refundPending: Boolean(booking.payment.refundId) };
    }),
    submitReview: protectedProcedure.input(z.object({ bookingId: validId, rating: z.number().int().min(1).max(5), comment: z.string().trim().min(3).max(1200).optional() })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "PLAYER");
      const booking = await Booking.findOne({ _id: input.bookingId, playerOpenId: ctx.user.openId, status: "COMPLETED" }).lean();
      if (!booking) throw new TRPCError({ code: "FORBIDDEN", message: "Only a completed personal booking can be reviewed." });
      const existing = await Review.findOne({ bookingId: booking._id }).lean();
      const decision = getReviewSubmissionDecision(booking.status, Boolean(existing));
      if (!decision.allowed) throw new TRPCError({ code: decision.code, message: decision.message });
      try {
        const review = await Review.create({ arenaId: booking.arenaId, bookingId: booking._id, playerOpenId: ctx.user.openId, rating: input.rating, comment: input.comment, status: "PENDING" });
        return { reviewId: review._id.toString(), bookingId: booking._id.toString(), status: review.status };
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? (error as { code?: number }).code : undefined;
        if (code === 11000) throw new TRPCError({ code: "CONFLICT", message: "You have already submitted feedback for this booking." });
        throw error;
      }
    }),
    reviewStatuses: protectedProcedure.query(async ({ ctx }) => {
      await requireProfile(ctx.user.openId, "PLAYER");
      const reviews = await Review.find({ playerOpenId: ctx.user.openId }).sort({ createdAt: -1 }).lean();
      return reviews.map(toPlayerReviewStatusPayload);
    }),
  }),
  payments: router({
    createOrder: protectedProcedure.input(z.object({ bookingId: validId })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "PLAYER");
      const booking = await Booking.findOne({ _id: input.bookingId, playerOpenId: ctx.user.openId, status: "PENDING_PAYMENT" });
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "A pending booking was not found." });
      const order = await getRazorpay().orders.create({ amount: Math.round(booking.subtotal * 100), currency: "INR", receipt: booking.reference, notes: { arenaHubBookingId: booking._id.toString() } });
      booking.payment = { provider: "RAZORPAY", orderId: order.id, status: "PENDING" };
      await booking.save();
      return { orderId: order.id, amount: order.amount, currency: order.currency, bookingReference: booking.reference, keyId: process.env.RAZORPAY_KEY_ID };
    }),
    verifyCheckout: protectedProcedure.input(z.object({ bookingId: validId, razorpayOrderId: z.string().min(3), razorpayPaymentId: z.string().min(3), razorpaySignature: z.string().min(32) })).mutation(async ({ ctx, input }) => {
      await requireProfile(ctx.user.openId, "PLAYER");
      const booking = await Booking.findOne({ _id: input.bookingId, playerOpenId: ctx.user.openId, "payment.orderId": input.razorpayOrderId });
      const secret = process.env.RAZORPAY_KEY_SECRET;
      if (!booking || !secret) throw new TRPCError({ code: "NOT_FOUND", message: "Payment order not found or payment verification is unavailable." });
      const expected = crypto.createHmac("sha256", secret).update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.razorpaySignature))) throw new TRPCError({ code: "FORBIDDEN", message: "Payment signature verification failed." });
      booking.payment = { provider: "RAZORPAY", orderId: input.razorpayOrderId, paymentId: input.razorpayPaymentId, status: "PENDING" };
      await booking.save();
      return { accepted: true, message: "Payment proof received. Booking confirmation waits for verified provider status." };
    }),
  }),
  admin: router({
    reviewQueue: adminProcedure.query(async () => {
      await connected();
      const [arenas, documents, reviews] = await Promise.all([Arena.find({ status: "PENDING" }).sort({ createdAt: 1 }).lean(), ArenaDocument.find({ status: "PENDING", kind: { $in: ["VERIFICATION_DOCUMENT", "ARENA_PHOTO", "EQUIPMENT_PHOTO"] } }).sort({ createdAt: 1 }).lean(), Review.find({ status: "PENDING" }).sort({ createdAt: 1 }).lean()]);
      return { arenas, documents, reviews };
    }),
    arenaDetail: adminProcedure.input(z.object({ arenaId: validId })).query(async ({ input }) => {
      await connected();
      const arena = await Arena.findById(input.arenaId).lean();
      if (!arena) throw new TRPCError({ code: "NOT_FOUND", message: "The requested arena record was not found." });
      const [owner, courts, equipment, documents, reviews] = await Promise.all([
        Profile.findOne({ openId: arena.ownerOpenId }).lean(),
        Court.find({ arenaId: arena._id }).sort({ createdAt: -1 }).lean(),
        Equipment.find({ arenaId: arena._id }).sort({ createdAt: -1 }).lean(),
        ArenaDocument.find({ ownerOpenId: arena.ownerOpenId }).sort({ createdAt: -1 }).lean(),
        Review.find({ arenaId: arena._id }).sort({ createdAt: -1 }).lean(),
      ]);
      const photoIds = new Set(arena.photoIds.map(photoId => photoId.toString()));
      const files = documents.map(document => ({
        ...document,
        id: document._id.toString(),
        url: `/manus-storage/${document.storageKey}`,
        attachedToArena: photoIds.has(document._id.toString()),
      }));
      return {
        arena,
        owner,
        courts,
        equipment,
        documents: files,
        photos: files.filter(file => file.kind === "ARENA_PHOTO" && file.attachedToArena),
        reviews,
      };
    }),
    metrics: adminProcedure.query(async () => {
      await connected();
      const [users, activeUsers, approvedArenas, rejectedArenas, pendingArenas, confirmedBookings, pendingReviewDocuments] = await Promise.all([
        Profile.countDocuments(),
        Profile.countDocuments({ active: true }),
        Arena.countDocuments(approvedArena),
        Arena.countDocuments({ status: "REJECTED" }),
        Arena.countDocuments({ status: "PENDING" }),
        Booking.countDocuments({ status: "CONFIRMED" }),
        ArenaDocument.countDocuments({ status: "PENDING" }),
      ]);
      return { users, activeUsers, approvedArenas, rejectedArenas, pendingArenas, confirmedBookings, pendingReviewDocuments, arenaDecisionTotals: { approved: approvedArenas, rejected: rejectedArenas } };
    }),
    users: adminProcedure.query(async () => { await connected(); return Profile.find().sort({ updatedAt: -1 }).limit(100).lean(); }),
    setUserStatus: adminProcedure.input(z.object({ openId: z.string().min(1).max(128), active: z.boolean() })).mutation(async ({ input }) => { await connected(); return Profile.findOneAndUpdate({ openId: input.openId, role: { $ne: "ADMIN" } }, { $set: { active: input.active } }, { new: true }).lean(); }),
    reviewArena: adminProcedure.input(z.object({ arenaId: validId, status: z.enum(["APPROVED", "REJECTED"]), rejectionReason: z.string().trim().min(5).max(500).optional() })).mutation(async ({ ctx, input }) => {
      requireDesignatedApprovalAdmin(ctx.user.email);
      await connected();
      const arena = await Arena.findById(input.arenaId);
      if (!arena) throw new TRPCError({ code: "NOT_FOUND", message: "Arena not found." });
      if (!canTransitionArenaStatus(arena.status, input.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This arena cannot make that status transition." });
      if (input.status === "REJECTED" && !input.rejectionReason) throw new TRPCError({ code: "BAD_REQUEST", message: "Give the arena owner a clear reason for rejection." });
      arena.status = input.status; arena.verificationStatus = input.status; arena.rejectionReason = input.status === "REJECTED" ? input.rejectionReason : undefined; await arena.save();
      await notify(arena.ownerOpenId, input.status === "APPROVED" ? "ARENA_APPROVED" : "ARENA_REJECTED", input.status === "APPROVED" ? "Arena approved" : "Arena review complete", input.status === "APPROVED" ? `${arena.name} is now visible in public discovery.` : `${arena.name} was not approved for public discovery. Review your submission before resubmitting.`, "/owner");
      return arena;
    }),
    reviewDocument: adminProcedure.input(z.object({ documentId: validId, status: z.enum(["APPROVED", "REJECTED"]), rejectionReason: z.string().trim().min(5).max(500).optional() })).mutation(async ({ ctx, input }) => {
      requireDesignatedApprovalAdmin(ctx.user.email);
      await connected();
      if (input.status === "REJECTED" && !input.rejectionReason) throw new TRPCError({ code: "BAD_REQUEST", message: "Give owners a clear reason when rejecting a file." });
      const document = await ArenaDocument.findByIdAndUpdate(input.documentId, { $set: { status: input.status, rejectionReason: input.rejectionReason } }, { new: true }).lean();
      if (document) await notify(document.ownerOpenId, input.status === "APPROVED" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED", input.status === "APPROVED" ? "File approved" : "File needs attention", input.status === "APPROVED" ? `${document.originalName} is approved.` : `${document.originalName} was rejected: ${input.rejectionReason}`, "/documents");
      return document;
    }),
    reviewReview: adminProcedure.input(z.object({ reviewId: validId, status: z.enum(["APPROVED", "REJECTED"]) })).mutation(async ({ ctx, input }) => {
      requireDesignatedApprovalAdmin(ctx.user.email);
      await connected();
      const review = await Review.findOneAndUpdate({ _id: input.reviewId, status: "PENDING" }, { $set: { status: input.status } }, { new: true }).lean();
      if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "A pending review was not found." });
      await notify(review.playerOpenId, "BOOKING_UPDATE", input.status === "APPROVED" ? "Review published" : "Review not published", input.status === "APPROVED" ? "Your completed-booking review is now visible on the arena page." : "Your review was not published.", "/dashboard");
      return review;
    }),
  }),
});

export async function processRazorpayWebhook(rawBody: Buffer, signature: string | undefined, eventId: string | undefined) {
  await connected();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !eventId) throw new TRPCError({ code: "FORBIDDEN", message: "Invalid Razorpay webhook configuration." });
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new TRPCError({ code: "FORBIDDEN", message: "Webhook signature verification failed." });
  if (await WebhookEvent.exists({ eventId })) return { duplicate: true };
  const event = JSON.parse(rawBody.toString("utf8")) as { event?: string; payload?: { payment?: { entity?: { order_id?: string; id?: string } } } };
  const payment = event.payload?.payment?.entity;
  if ((event.event === "payment.captured" || event.event === "order.paid") && payment?.order_id) await Booking.findOneAndUpdate({ "payment.orderId": payment.order_id }, { $set: { status: "CONFIRMED", "payment.status": "PAID", "payment.paymentId": payment.id } });
  if ((event.event === "payment.captured" || event.event === "order.paid") && payment?.order_id) {
    const booking = await Booking.findOne({ "payment.orderId": payment.order_id }).lean();
    if (booking) {
      await createReceiptForBooking(booking._id.toString());
      await notify(booking.playerOpenId, "BOOKING_CONFIRMED", "Booking confirmed", `Your ${booking.reference} payment has been verified. Your receipt is now available privately.`, "/documents");
      try { await scheduleUpcomingBookingReminder(booking); } catch (error) { console.error("[ArenaHub] Booking reminder was not scheduled", error); }
      const arena = await Arena.findById(booking.arenaId).lean();
      if (arena) await notify(arena.ownerOpenId, "BOOKING_UPDATE", "New confirmed booking", `A player booking is confirmed for ${arena.name}.`, "/owner");
    }
  }
  if (event.event === "payment.failed" && payment?.order_id) {
    const booking = await Booking.findOneAndUpdate({ "payment.orderId": payment.order_id, status: "PENDING_PAYMENT" }, { $set: { "payment.status": "FAILED" } }, { new: true }).lean();
    if (booking) await notify(booking.playerOpenId, "PAYMENT_FAILED", "Payment was not completed", `Payment for ${booking.reference} did not complete. The court slot is not confirmed.`, "/dashboard");
  }
  const refund = (event as { payload?: { refund?: { entity?: { payment_id?: string; id?: string } } } }).payload?.refund?.entity;
  if (event.event === "refund.processed" && refund?.payment_id) await Booking.findOneAndUpdate({ "payment.paymentId": refund.payment_id }, { $set: { "payment.status": "REFUNDED", "payment.refundId": refund.id } });
  await WebhookEvent.create({ provider: "RAZORPAY", eventId, eventType: event.event ?? "unknown", processedAt: new Date() });
  return { duplicate: false };
}

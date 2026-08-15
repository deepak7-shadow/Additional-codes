import { randomUUID } from "crypto";
import mongoose, { Model, Schema } from "mongoose";

export type ArenaHubRole = "PLAYER" | "OWNER" | "ADMIN";
export type ApprovalStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export type BookingStatus = "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "EXPIRED";
export type AssetKind = "ARENA_PHOTO" | "EQUIPMENT_PHOTO" | "VERIFICATION_DOCUMENT" | "RECEIPT";

type ProfileRecord = {
  openId: string;
  displayName?: string;
  email?: string;
  role: ArenaHubRole;
  verificationStatus: ApprovalStatus;
  active: boolean;
  preferences: { sports: string[]; latitude?: number; longitude?: number };
  createdAt: Date;
  updatedAt: Date;
};

type DocumentRecord = {
  ownerOpenId: string;
  kind: AssetKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  caption?: string;
  status: ApprovalStatus;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
};

type ArenaRecord = {
  ownerOpenId: string;
  name: string;
  description: string;
  sports: string[];
  location: { address: string; city: string; latitude: number; longitude: number };
  status: ApprovalStatus;
  verificationStatus: ApprovalStatus;
  rejectionReason?: string;
  photoIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
};

type CourtRecord = {
  arenaId: mongoose.Types.ObjectId;
  name: string;
  sport: string;
  pricePerHour: number;
  availability: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type EquipmentRecord = {
  arenaId: mongoose.Types.ObjectId;
  name: string;
  sport: string;
  pricePerHour: number;
  quantityAvailable: number;
  condition: "NEW" | "GOOD" | "FAIR";
  photoIds: mongoose.Types.ObjectId[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type BookingRecord = {
  reference: string;
  playerOpenId: string;
  arenaId: mongoose.Types.ObjectId;
  courtId: mongoose.Types.ObjectId;
  sport: string;
  slotStart: Date;
  slotEnd: Date;
  equipment: Array<{ equipmentId: mongoose.Types.ObjectId; quantity: number; unitPrice: number }>;
  subtotal: number;
  status: BookingStatus;
  payment: { provider?: "RAZORPAY"; orderId?: string; paymentId?: string; refundId?: string; status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" };
  receiptDocumentId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

type WebhookEventRecord = {
  provider: "RAZORPAY";
  eventId: string;
  eventType: string;
  processedAt: Date;
};

type NotificationRecord = {
  recipientOpenId: string;
  kind: "BOOKING_CONFIRMED" | "BOOKING_CANCELLED" | "PAYMENT_FAILED" | "ARENA_APPROVED" | "ARENA_REJECTED" | "DOCUMENT_APPROVED" | "DOCUMENT_REJECTED" | "BOOKING_UPDATE";
  title: string;
  body: string;
  href?: string;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ReviewRecord = {
  arenaId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  playerOpenId: string;
  rating: number;
  comment?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
  updatedAt: Date;
};

const profileSchema = new Schema<ProfileRecord>({
  openId: { type: String, required: true, unique: true, index: true },
  displayName: String,
  email: { type: String, lowercase: true, trim: true, unique: true, sparse: true, index: true },
  role: { type: String, enum: ["PLAYER", "OWNER", "ADMIN"], required: true, default: "PLAYER" },
  active: { type: Boolean, required: true, default: true },
  verificationStatus: { type: String, enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"], required: true, default: "DRAFT" },
  preferences: { sports: { type: [String], default: [] }, latitude: Number, longitude: Number },
}, { timestamps: true, versionKey: false });

const documentSchema = new Schema<DocumentRecord>({
  ownerOpenId: { type: String, required: true, index: true },
  kind: { type: String, enum: ["ARENA_PHOTO", "EQUIPMENT_PHOTO", "VERIFICATION_DOCUMENT", "RECEIPT"], required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  storageKey: { type: String, required: true, unique: true },
  caption: String,
  status: { type: String, enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"], required: true, default: "PENDING" },
  rejectionReason: String,
}, { timestamps: true, versionKey: false });

const arenaSchema = new Schema<ArenaRecord>({
  ownerOpenId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  sports: { type: [String], required: true, default: [] },
  location: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  status: { type: String, enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"], required: true, default: "DRAFT", index: true },
  verificationStatus: { type: String, enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"], required: true, default: "DRAFT" },
  rejectionReason: String,
  photoIds: { type: [Schema.Types.ObjectId], ref: "ArenaDocument", default: [] },
}, { timestamps: true, versionKey: false });

const courtSchema = new Schema<CourtRecord>({
  arenaId: { type: Schema.Types.ObjectId, ref: "Arena", required: true, index: true },
  name: { type: String, required: true },
  sport: { type: String, required: true },
  pricePerHour: { type: Number, required: true, min: 0 },
  availability: { type: [{ dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, startMinute: { type: Number, required: true, min: 0, max: 1439 }, endMinute: { type: Number, required: true, min: 1, max: 1440 } }], default: [] },
  active: { type: Boolean, required: true, default: true },
}, { timestamps: true, versionKey: false });

const equipmentSchema = new Schema<EquipmentRecord>({
  arenaId: { type: Schema.Types.ObjectId, ref: "Arena", required: true, index: true },
  name: { type: String, required: true },
  sport: { type: String, required: true },
  pricePerHour: { type: Number, required: true, min: 0 },
  quantityAvailable: { type: Number, required: true, min: 0 },
  condition: { type: String, enum: ["NEW", "GOOD", "FAIR"], required: true },
  photoIds: { type: [Schema.Types.ObjectId], ref: "ArenaDocument", default: [] },
  active: { type: Boolean, required: true, default: true },
}, { timestamps: true, versionKey: false });

const bookingSchema = new Schema<BookingRecord>({
  reference: { type: String, required: true, unique: true, index: true },
  playerOpenId: { type: String, required: true, index: true },
  arenaId: { type: Schema.Types.ObjectId, ref: "Arena", required: true, index: true },
  courtId: { type: Schema.Types.ObjectId, ref: "Court", required: true, index: true },
  sport: { type: String, required: true },
  slotStart: { type: Date, required: true, index: true },
  slotEnd: { type: Date, required: true, index: true },
  equipment: { type: [{ equipmentId: { type: Schema.Types.ObjectId, required: true }, quantity: { type: Number, required: true }, unitPrice: { type: Number, required: true } }], default: [] },
  subtotal: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "COMPLETED", "EXPIRED"], required: true, default: "PENDING_PAYMENT", index: true },
  payment: {
    provider: { type: String, enum: ["RAZORPAY"] }, orderId: String, paymentId: String, refundId: String,
    status: { type: String, enum: ["PENDING", "PAID", "FAILED", "REFUNDED"], required: true, default: "PENDING" },
  },
  receiptDocumentId: { type: Schema.Types.ObjectId, ref: "ArenaDocument" },
}, { timestamps: true, versionKey: false });
bookingSchema.index({ courtId: 1, slotStart: 1, slotEnd: 1, status: 1 });

const webhookEventSchema = new Schema<WebhookEventRecord>({
  provider: { type: String, enum: ["RAZORPAY"], required: true },
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  processedAt: { type: Date, required: true, default: () => new Date() },
}, { versionKey: false });

const notificationSchema = new Schema<NotificationRecord>({
  recipientOpenId: { type: String, required: true, index: true },
  kind: { type: String, enum: ["BOOKING_CONFIRMED", "BOOKING_CANCELLED", "PAYMENT_FAILED", "ARENA_APPROVED", "ARENA_REJECTED", "DOCUMENT_APPROVED", "DOCUMENT_REJECTED", "BOOKING_UPDATE"], required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  href: String,
  readAt: Date,
}, { timestamps: true, versionKey: false });

const reviewSchema = new Schema<ReviewRecord>({
  arenaId: { type: Schema.Types.ObjectId, ref: "Arena", required: true, index: true },
  bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true, index: true },
  playerOpenId: { type: String, required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 1200 },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], required: true, default: "PENDING", index: true },
}, { timestamps: true, versionKey: false });

export const Profile = (mongoose.models.ArenaProfile as Model<ProfileRecord>) || mongoose.model<ProfileRecord>("ArenaProfile", profileSchema);
export const ArenaDocument = (mongoose.models.ArenaDocument as Model<DocumentRecord>) || mongoose.model<DocumentRecord>("ArenaDocument", documentSchema);
export const Arena = (mongoose.models.Arena as Model<ArenaRecord>) || mongoose.model<ArenaRecord>("Arena", arenaSchema);
export const Court = (mongoose.models.Court as Model<CourtRecord>) || mongoose.model<CourtRecord>("Court", courtSchema);
export const Equipment = (mongoose.models.Equipment as Model<EquipmentRecord>) || mongoose.model<EquipmentRecord>("Equipment", equipmentSchema);
export const Booking = (mongoose.models.Booking as Model<BookingRecord>) || mongoose.model<BookingRecord>("Booking", bookingSchema);
export const WebhookEvent = (mongoose.models.WebhookEvent as Model<WebhookEventRecord>) || mongoose.model<WebhookEventRecord>("WebhookEvent", webhookEventSchema);
export const Notification = (mongoose.models.ArenaNotification as Model<NotificationRecord>) || mongoose.model<NotificationRecord>("ArenaNotification", notificationSchema);
export const Review = (mongoose.models.ArenaReview as Model<ReviewRecord>) || mongoose.model<ReviewRecord>("ArenaReview", reviewSchema);

export const DEFAULT_COURT_AVAILABILITY = [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({ dayOfWeek, startMinute: 360, endMinute: 1320 }));

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function getArenaHubDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!connectionPromise) connectionPromise = mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 }).catch(error => { connectionPromise = null; throw error; });
  return connectionPromise;
}

export function makeBookingReference() { return `AH-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`; }

export function calculateBookingSubtotal(courtPricePerHour: number, durationHours: number, rentals: Array<{ unitPrice: number; quantity: number }>) {
  const courtAmount = Math.round(courtPricePerHour * durationHours * 100) / 100;
  const rentalAmount = rentals.reduce((total, rental) => total + rental.unitPrice * rental.quantity * durationHours, 0);
  return Math.round((courtAmount + rentalAmount) * 100) / 100;
}

export function canTransitionArenaStatus(current: ApprovalStatus, next: ApprovalStatus) {
  const valid: Record<ApprovalStatus, ApprovalStatus[]> = { DRAFT: ["PENDING"], PENDING: ["APPROVED", "REJECTED"], APPROVED: ["REJECTED"], REJECTED: ["DRAFT", "PENDING"] };
  return valid[current].includes(next);
}

export function canPlayerSubmitReview(bookingStatus: BookingStatus, hasExistingReview: boolean) {
  return bookingStatus === "COMPLETED" && !hasExistingReview;
}

export function getReviewSubmissionDecision(bookingStatus: BookingStatus, hasExistingReview: boolean) {
  if (bookingStatus !== "COMPLETED") return { allowed: false as const, code: "FORBIDDEN" as const, message: "Only a completed personal booking can be reviewed." };
  if (hasExistingReview) return { allowed: false as const, code: "CONFLICT" as const, message: "You have already submitted feedback for this booking." };
  return { allowed: true as const };
}

export function toPlayerReviewStatusPayload(review: { bookingId: { toString(): string }; status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: Date }) {
  return { bookingId: review.bookingId.toString(), status: review.status, createdAt: review.createdAt };
}

export function canOwnerAccessArenaRecord(arenaOwnerOpenId: string, requesterOpenId: string) {
  return arenaOwnerOpenId === requesterOpenId;
}

export function getOwnerArenaUpdateDecision(arenaOwnerOpenId: string, requesterOpenId: string) {
  if (arenaOwnerOpenId !== requesterOpenId) {
    return { allowed: false as const, code: "FORBIDDEN" as const, message: "You can only edit your own arena." };
  }
  return {
    allowed: true as const,
    nextStatus: "PENDING" as const,
    nextVerificationStatus: "PENDING" as const,
    clearRejectionReason: true as const,
  };
}

export function getPostSubmissionDocumentDecision(ownerOpenId: string, requesterOpenId: string, kind: Exclude<AssetKind, "RECEIPT">) {
  if (ownerOpenId !== requesterOpenId) {
    return { allowed: false as const, code: "FORBIDDEN" as const, message: "You can only add documents to your own owner record." };
  }
  return {
    allowed: true as const,
    kind,
    nextStatus: "PENDING" as const,
    retainsExistingDocuments: true as const,
  };
}

export function toOwnerArenaRecordPayload<TArena, TCourt, TEquipment, TDocument, TReview>(record: {
  arena: TArena;
  courts: TCourt[];
  equipment: TEquipment[];
  documents: TDocument[];
  reviews: TReview[];
  bookingCount: number;
}) {
  return {
    arena: record.arena,
    courts: record.courts,
    equipment: record.equipment,
    documents: record.documents,
    reviews: record.reviews,
    bookingCount: record.bookingCount,
  };
}

export async function isCourtSlotAvailable(courtId: string, slotStart: Date, slotEnd: Date) {
  const conflict = await Booking.exists({ courtId: new mongoose.Types.ObjectId(courtId), status: { $in: ["PENDING_PAYMENT", "CONFIRMED"] }, slotStart: { $lt: slotEnd }, slotEnd: { $gt: slotStart } });
  return !conflict;
}

export function isWithinCourtAvailability(court: Pick<CourtRecord, "availability">, slotStart: Date, slotEnd: Date) {
  if (!court.availability?.length) return true;
  if (slotStart.getUTCFullYear() !== slotEnd.getUTCFullYear() || slotStart.getUTCMonth() !== slotEnd.getUTCMonth() || slotStart.getUTCDate() !== slotEnd.getUTCDate()) return false;
  const startMinute = slotStart.getUTCHours() * 60 + slotStart.getUTCMinutes();
  const endMinute = slotEnd.getUTCHours() * 60 + slotEnd.getUTCMinutes();
  return court.availability.some(window => window.dayOfWeek === slotStart.getUTCDay() && startMinute >= window.startMinute && endMinute <= window.endMinute);
}

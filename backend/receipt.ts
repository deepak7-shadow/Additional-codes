import PDFDocument from "pdfkit";
import { Arena, ArenaDocument, Booking, Court, Equipment } from "./arenahub";
import { storagePut } from "./storage";

const BOOKING_DOCUMENT_VERSION = "BOOKING_DOCUMENT_V2";

function money(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

export function bookingRentalSummary(
  rentals: Array<{ equipmentId: { toString(): string }; quantity: number; unitPrice: number }>,
  equipment: Array<{ _id: { toString(): string }; name: string }>,
) {
  if (!rentals.length) return "No rental equipment selected";
  return rentals.map(rental => {
    const item = equipment.find(entry => entry._id.toString() === rental.equipmentId.toString());
    return `${rental.quantity} × ${item?.name ?? "Equipment item"} at ${money(rental.unitPrice)}/hour`;
  }).join(" · ");
}

function createPdfBuffer(lines: Array<{ label: string; value: string }>) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 52 });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.rect(0, 0, 595, 108).fill("#0A2930");
    document.fillColor("#F2A35D").fontSize(18).font("Helvetica-Bold").text("ARENAHUB", 52, 42);
    document.fillColor("#F7F4EB").fontSize(9).font("Helvetica").text("VERIFIED SPORT, BOOKED SIMPLY", 52, 68);
    document.fillColor("#102B33").fontSize(25).font("Helvetica-Bold").text("Booking document", 52, 142);
    document.fillColor("#527176").fontSize(10).font("Helvetica").text("Verified court reservation and rental-equipment record.", 52, 177);
    let y = 220;
    lines.forEach((line, index) => {
      if (index % 2 === 0) document.rect(52, y - 8, 491, 31).fill("#F2F7F5");
      document.fillColor("#527176").fontSize(8).font("Helvetica-Bold").text(line.label.toUpperCase(), 64, y);
      document.fillColor("#102B33").fontSize(10).font("Helvetica").text(line.value, 230, y, { width: 300, align: "right" });
      y += 39;
    });
    document.moveTo(52, y + 10).lineTo(543, y + 10).strokeColor("#D8E8E6").stroke();
    document.fillColor("#527176").fontSize(8).font("Helvetica").text("ArenaHub · Private booking record", 52, y + 28);
    document.end();
  });
}

export async function createReceiptForBooking(bookingId: string) {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.payment.status !== "PAID" || booking.status !== "CONFIRMED") return null;
  if (booking.receiptDocumentId) {
    const existing = await ArenaDocument.findById(booking.receiptDocumentId).lean();
    if (existing?.caption === BOOKING_DOCUMENT_VERSION) return booking.receiptDocumentId;
  }
  const rentalEquipmentIds = booking.equipment.map(item => item.equipmentId);
  const [arena, court, rentalEquipment] = await Promise.all([
    Arena.findById(booking.arenaId).lean(),
    Court.findById(booking.courtId).lean(),
    rentalEquipmentIds.length ? Equipment.find({ _id: { $in: rentalEquipmentIds } }).lean() : [],
  ]);
  const receiptDate = new Date();
  const pdf = await createPdfBuffer([
    { label: "Booking reference", value: booking.reference },
    { label: "Payment status", value: "Paid" },
    { label: "Arena", value: arena?.name ?? "ArenaHub verified venue" },
    { label: "Court", value: `${court?.name ?? "Booked court"} · ${money(court?.pricePerHour ?? 0)}/hour` },
    { label: "Sport", value: booking.sport },
    { label: "Slot", value: `${booking.slotStart.toLocaleString("en-IN")} – ${booking.slotEnd.toLocaleTimeString("en-IN")}` },
    { label: "Rental equipment", value: bookingRentalSummary(booking.equipment, rentalEquipment) },
    { label: "Amount", value: money(booking.subtotal) },
    { label: "Payment reference", value: booking.payment.paymentId ?? "Provider confirmation pending" },
    { label: "Generated", value: receiptDate.toLocaleString("en-IN") },
  ]);
  const { key } = await storagePut(`arenahub/${booking.playerOpenId}/receipts/${booking.reference}.pdf`, pdf, "application/pdf");
  const receipt = await ArenaDocument.create({
    ownerOpenId: booking.playerOpenId,
    kind: "RECEIPT",
    originalName: `${booking.reference}-receipt.pdf`,
    mimeType: "application/pdf",
    sizeBytes: pdf.length,
    storageKey: key,
    caption: BOOKING_DOCUMENT_VERSION,
    status: "APPROVED",
  });
  booking.receiptDocumentId = receipt._id;
  await booking.save();
  return receipt._id;
}

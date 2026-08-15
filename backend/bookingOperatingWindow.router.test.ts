import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { toVenueOperatingTimeIso } from "../frontend/src/lib/bookingTime";

const profileFindOne = vi.fn();
const courtFindById = vi.fn();
const bookingCreate = vi.fn();
const isCourtSlotAvailable = vi.fn();

vi.mock("./arenahub", async () => {
  const actual = await vi.importActual<typeof import("./arenahub")>("./arenahub");
  return {
    ...actual,
    getArenaHubDatabase: vi.fn(async () => ({})),
    Profile: { findOne: profileFindOne },
    Court: { findById: courtFindById },
    Booking: { create: bookingCreate },
    Equipment: { find: vi.fn() },
    isCourtSlotAvailable,
  };
});

const { arenaHubRouter } = await import("./arenaHub.router");

function context(): TrpcContext {
  return {
    user: { id: 1, openId: "player-1", email: "player@example.com", name: "Player", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function nextVenueSlot() {
  const date = new Date(Date.now() + 48 * 60 * 60 * 1000);
  date.setUTCSeconds(0, 0);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return { localStart: `${year}-${month}-${day}T10:00`, localEnd: `${year}-${month}-${day}T11:00`, dayOfWeek: date.getUTCDay() };
}

describe("booking quote operating-window contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a player booking quote when the converted AM/PM venue time is inside the court operating window", async () => {
    const { localStart, localEnd, dayOfWeek } = nextVenueSlot();
    const courtId = "a".repeat(24);
    profileFindOne.mockReturnValue({ lean: vi.fn(async () => ({ openId: "player-1", role: "PLAYER", active: true })) });
    courtFindById.mockReturnValue({ lean: vi.fn(async () => ({ _id: { toString: () => courtId }, arenaId: { toString: () => "b".repeat(24) }, sport: "Badminton", active: true, pricePerHour: 650, availability: [{ dayOfWeek, startMinute: 9 * 60, endMinute: 22 * 60 }] })) });
    isCourtSlotAvailable.mockResolvedValue(true);
    bookingCreate.mockResolvedValue({ _id: { toString: () => "c".repeat(24) }, reference: "AH-VALID-SLOT" });

    const result = await arenaHubRouter.createCaller(context()).booking.quote({
      courtId,
      slotStart: toVenueOperatingTimeIso(localStart),
      slotEnd: toVenueOperatingTimeIso(localEnd),
      equipment: [],
    });

    expect(result).toMatchObject({ bookingId: "c".repeat(24), reference: "AH-VALID-SLOT", subtotal: 650, currency: "INR" });
    expect(bookingCreate).toHaveBeenCalledWith(expect.objectContaining({
      playerOpenId: "player-1",
      courtId: expect.anything(),
      slotStart: new Date(toVenueOperatingTimeIso(localStart)),
      slotEnd: new Date(toVenueOperatingTimeIso(localEnd)),
      status: "PENDING_PAYMENT",
    }));
  });
});

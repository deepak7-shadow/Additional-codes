import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const profileFindOne = vi.fn();
const bookingFindOne = vi.fn();
const documentFindById = vi.fn();
const createReceiptForBooking = vi.fn();

vi.mock("./arenahub", async () => {
  const actual = await vi.importActual<typeof import("./arenahub")>("./arenahub");
  return {
    ...actual,
    getArenaHubDatabase: vi.fn(async () => ({})),
    Profile: { findOne: profileFindOne },
    Booking: { findOne: bookingFindOne },
    ArenaDocument: { findById: documentFindById },
  };
});

vi.mock("./receipt", () => ({ createReceiptForBooking }));

const { arenaHubRouter } = await import("./arenaHub.router");
const id = (value: string) => ({ toString: () => value });

function context(): TrpcContext {
  return {
    user: { id: 1, openId: "player-1", email: "player@example.com", name: "Player", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("player booking document download", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a private booking document only for the player who owns a paid confirmed booking", async () => {
    profileFindOne.mockReturnValue({ lean: vi.fn(async () => ({ openId: "player-1", role: "PLAYER", active: true })) });
    bookingFindOne.mockReturnValue({ lean: vi.fn(async () => ({ _id: id("booking-1"), playerOpenId: "player-1" })) });
    createReceiptForBooking.mockResolvedValue(id("document-1"));
    documentFindById.mockReturnValue({ lean: vi.fn(async () => ({ ownerOpenId: "player-1", originalName: "AH-001-receipt.pdf", storageKey: "arenahub/player-1/receipts/AH-001.pdf" })) });

    const result = await arenaHubRouter.createCaller(context()).booking.downloadDocument({ bookingId: "64b64c63f496f38a998f01aa" });

    expect(bookingFindOne).toHaveBeenCalledWith({ _id: "64b64c63f496f38a998f01aa", playerOpenId: "player-1", status: { $in: ["CONFIRMED", "COMPLETED"] }, "payment.status": "PAID" });
    expect(createReceiptForBooking).toHaveBeenCalledWith("booking-1");
    expect(result).toEqual({ key: "arenahub/player-1/receipts/AH-001.pdf", url: "/manus-storage/arenahub/player-1/receipts/AH-001.pdf", fileName: "AH-001-receipt.pdf" });
  });

  it("does not reveal a booking document when the booking is not owned by the current player", async () => {
    profileFindOne.mockReturnValue({ lean: vi.fn(async () => ({ openId: "player-1", role: "PLAYER", active: true })) });
    bookingFindOne.mockReturnValue({ lean: vi.fn(async () => null) });

    await expect(arenaHubRouter.createCaller(context()).booking.downloadDocument({ bookingId: "64b64c63f496f38a998f01aa" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(createReceiptForBooking).not.toHaveBeenCalled();
  });
});

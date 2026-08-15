import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const profileFindOne = vi.fn();
const bookingFind = vi.fn();
const arenaFind = vi.fn();

vi.mock("./arenahub", async () => {
  const actual = await vi.importActual<typeof import("./arenahub")>("./arenahub");
  return {
    ...actual,
    getArenaHubDatabase: vi.fn(async () => ({})),
    Profile: { findOne: profileFindOne },
    Booking: { find: bookingFind },
    Arena: { find: arenaFind },
  };
});

const { arenaHubRouter } = await import("./arenaHub.router");
const id = (value: string) => ({ toString: () => value });

function context(): TrpcContext {
  return {
    user: { id: 1, openId: "player-1", email: "player@example.com", name: "Player", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("player booking exact arena location", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the saved booked-arena coordinates with the player’s own booking history", async () => {
    profileFindOne.mockReturnValue({ lean: vi.fn(async () => ({ openId: "player-1", role: "PLAYER", active: true })) });
    bookingFind.mockReturnValue({ sort: vi.fn(() => ({ lean: vi.fn(async () => [{ _id: id("booking-1"), arenaId: id("arena-1"), reference: "AH-001", sport: "Badminton" }]) })) });
    arenaFind.mockReturnValue({ lean: vi.fn(async () => [{ _id: id("arena-1"), name: "City Courts", location: { address: "21 Court Street", city: "Bengaluru", latitude: 12.9716, longitude: 77.5946 } }]) });

    const result = await arenaHubRouter.createCaller(context()).booking.mine();

    expect(result).toEqual([expect.objectContaining({
      reference: "AH-001",
      arena: { id: "arena-1", name: "City Courts", location: { address: "21 Court Street", city: "Bengaluru", latitude: 12.9716, longitude: 77.5946 } },
    })]);
    expect(arenaFind).toHaveBeenCalledWith({ _id: { $in: ["arena-1"] }, status: "APPROVED", verificationStatus: "APPROVED" });
  });

  it("keeps booking history but withholds a rejected arena from the player dashboard payload", async () => {
    profileFindOne.mockReturnValue({ lean: vi.fn(async () => ({ openId: "player-1", role: "PLAYER", active: true })) });
    bookingFind.mockReturnValue({ sort: vi.fn(() => ({ lean: vi.fn(async () => [{ _id: id("booking-2"), arenaId: id("arena-rejected"), reference: "AH-002", sport: "Football" }]) })) });
    arenaFind.mockReturnValue({ lean: vi.fn(async () => []) });

    const result = await arenaHubRouter.createCaller(context()).booking.mine();

    expect(result).toEqual([expect.objectContaining({ reference: "AH-002", arena: null })]);
    expect(arenaFind).toHaveBeenCalledWith({ _id: { $in: ["arena-rejected"] }, status: "APPROVED", verificationStatus: "APPROVED" });
  });
});

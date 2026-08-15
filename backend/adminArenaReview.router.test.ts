import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const arenaFindById = vi.fn();
const arenaFind = vi.fn();
const arenaCountDocuments = vi.fn();
const profileFindOne = vi.fn();
const profileCountDocuments = vi.fn();
const courtFind = vi.fn();
const equipmentFind = vi.fn();
const documentFind = vi.fn();
const documentCountDocuments = vi.fn();
const reviewFind = vi.fn();
const bookingCountDocuments = vi.fn();

vi.mock("./arenahub", async () => {
  const actual = await vi.importActual<typeof import("./arenahub")>("./arenahub");
  return {
    ...actual,
    getArenaHubDatabase: vi.fn(async () => ({})),
    Arena: { find: arenaFind, findById: arenaFindById, countDocuments: arenaCountDocuments },
    Profile: { findOne: profileFindOne, countDocuments: profileCountDocuments },
    Court: { find: courtFind },
    Equipment: { find: equipmentFind },
    ArenaDocument: { find: documentFind, countDocuments: documentCountDocuments },
    Review: { find: reviewFind },
    Booking: { countDocuments: bookingCountDocuments },
  };
});

const { arenaHubRouter } = await import("./arenaHub.router");

const id = (value: string) => ({ toString: () => value });
const arenaId = "64b64c63f496f38a998f01aa";

function chain<T>(value: T) {
  return { sort: vi.fn(() => ({ lean: vi.fn(async () => value) })), lean: vi.fn(async () => value) };
}

function context(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "designated-admin",
      email: "deepak843161.438@gmail.com",
      name: "ArenaHub Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("ArenaHub administrator arena review records", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the complete selected arena submission, owner, courts, rentals, evidence, photographs, and review context", async () => {
    arenaFindById.mockReturnValue({ lean: vi.fn(async () => ({
      _id: id(arenaId), ownerOpenId: "owner-1", name: "City Courts", description: "A complete submitted arena record with real venue information.", sports: ["Badminton", "Tennis"], location: { address: "21 Court Street", city: "Bengaluru", latitude: 12.9716, longitude: 77.5946 }, status: "PENDING", verificationStatus: "PENDING", photoIds: [id("photo-1")], createdAt: new Date("2026-08-15T00:00:00Z"), updatedAt: new Date("2026-08-15T00:00:00Z"),
    })) });
    profileFindOne.mockReturnValue({ lean: vi.fn(async () => ({ openId: "owner-1", displayName: "Venue Owner", email: "owner@example.com", role: "OWNER", active: true })) });
    courtFind.mockReturnValue(chain([{ _id: id("court-1"), name: "Court A", sport: "Badminton", pricePerHour: 700, active: true, availability: [] }]));
    equipmentFind.mockReturnValue(chain([{ _id: id("equipment-1"), name: "Rackets", sport: "Badminton", quantityAvailable: 4, pricePerHour: 50, condition: "GOOD" }]));
    documentFind.mockReturnValue(chain([
      { _id: id("photo-1"), ownerOpenId: "owner-1", kind: "ARENA_PHOTO", originalName: "court.jpg", storageKey: "arenahub/court.jpg", status: "PENDING" },
      { _id: id("document-1"), ownerOpenId: "owner-1", kind: "VERIFICATION_DOCUMENT", originalName: "license.pdf", storageKey: "arenahub/license.pdf", status: "PENDING" },
    ]));
    reviewFind.mockReturnValue(chain([{ _id: id("review-1"), rating: 5, status: "PENDING", comment: "Great court" }]));

    const result = await arenaHubRouter.createCaller(context()).admin.arenaDetail({ arenaId });

    expect(result).toMatchObject({
      arena: { name: "City Courts", location: { latitude: 12.9716, longitude: 77.5946 } },
      owner: { displayName: "Venue Owner", email: "owner@example.com" },
      courts: [expect.objectContaining({ name: "Court A" })],
      equipment: [expect.objectContaining({ name: "Rackets" })],
      photos: [expect.objectContaining({ id: "photo-1", attachedToArena: true, url: "/manus-storage/arenahub/court.jpg" })],
      documents: expect.arrayContaining([expect.objectContaining({ id: "document-1", originalName: "license.pdf" })]),
      reviews: [expect.objectContaining({ rating: 5 })],
    });
  });

  it("reports distinct approved and rejected arena totals in live administrator metrics", async () => {
    profileCountDocuments.mockResolvedValueOnce(18).mockResolvedValueOnce(16);
    arenaCountDocuments.mockResolvedValueOnce(9).mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    bookingCountDocuments.mockResolvedValue(11);
    documentCountDocuments.mockResolvedValue(4);

    const result = await arenaHubRouter.createCaller(context()).admin.metrics();

    expect(result).toMatchObject({ approvedArenas: 9, rejectedArenas: 3, pendingArenas: 2, arenaDecisionTotals: { approved: 9, rejected: 3 } });
    expect(arenaCountDocuments).toHaveBeenNthCalledWith(1, { status: "APPROVED", verificationStatus: "APPROVED" });
    expect(arenaCountDocuments).toHaveBeenNthCalledWith(2, { status: "REJECTED" });
  });

  it("loads only pending arenas into the administrator review queue", async () => {
    arenaFind.mockReturnValue(chain([{ _id: id("pending-arena"), name: "Awaiting Review", location: { city: "Bengaluru" }, status: "PENDING" }]));
    documentFind.mockReturnValue(chain([]));
    reviewFind.mockReturnValue(chain([]));

    const result = await arenaHubRouter.createCaller(context()).admin.reviewQueue();

    expect(arenaFind).toHaveBeenCalledWith({ status: "PENDING" });
    expect(result.arenas).toEqual([expect.objectContaining({ name: "Awaiting Review", status: "PENDING" })]);
  });
});

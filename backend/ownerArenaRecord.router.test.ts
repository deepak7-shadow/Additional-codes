import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const profileFindOne = vi.fn();
const arenaFindOne = vi.fn();
const courtFind = vi.fn();
const equipmentFind = vi.fn();
const documentFind = vi.fn();
const reviewFind = vi.fn();
const bookingCountDocuments = vi.fn();

vi.mock("./arenahub", async () => {
  const actual = await vi.importActual<typeof import("./arenahub")>("./arenahub");
  return {
    ...actual,
    getArenaHubDatabase: vi.fn(async () => ({})),
    Profile: { findOne: profileFindOne },
    Arena: { findOne: arenaFindOne },
    Court: { find: courtFind },
    Equipment: { find: equipmentFind },
    ArenaDocument: { find: documentFind },
    Review: { find: reviewFind },
    Booking: { countDocuments: bookingCountDocuments },
  };
});

const { arenaHubRouter } = await import("./arenaHub.router");

const arenaId = "64b64c63f496f38a998f01aa";
const documentId = "64b64c63f496f38a998f01bb";
const id = (value: string) => ({ toString: () => value });
const sorted = <T>(value: T[]) => ({ sort: vi.fn(() => ({ lean: vi.fn(async () => value) })) });

function context(openId: string): TrpcContext {
  return {
    user: {
      id: 1,
      openId,
      email: `${openId}@example.com`,
      name: "Arena Owner",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function configureOwnerRecord(ownerOpenId = "owner-1") {
  profileFindOne.mockReturnValue({ lean: vi.fn(async () => ({ openId: ownerOpenId, role: "OWNER", active: true })) });
  arenaFindOne.mockReturnValue({ lean: vi.fn(async () => ({ _id: id(arenaId), ownerOpenId: "owner-1", name: "Real Arena", status: "PENDING", verificationStatus: "PENDING" })) });
  courtFind.mockReturnValue(sorted([{ _id: id("court-1"), name: "Court A", sport: "Badminton", pricePerHour: 500 }]));
  equipmentFind.mockReturnValue(sorted([{ _id: id("equipment-1"), name: "Racket", quantityAvailable: 4 }]));
  documentFind.mockReturnValue(sorted([{ _id: id(documentId), originalName: "license.pdf", mimeType: "application/pdf", sizeBytes: 1200, status: "PENDING" }]));
  reviewFind.mockReturnValue(sorted([{ _id: id("review-1"), rating: 5, status: "PENDING" }]));
  bookingCountDocuments.mockResolvedValue(2);
}

describe("arenaHub.owner.arenaRecord", () => {
  it("returns the complete protected record only to the owner of the arena", async () => {
    configureOwnerRecord();
    const result = await arenaHubRouter.createCaller(context("owner-1")).owner.arenaRecord({ arenaId });

    expect(result).toMatchObject({
      arena: { name: "Real Arena", status: "PENDING", verificationStatus: "PENDING" },
      courts: [{ name: "Court A", sport: "Badminton", pricePerHour: 500 }],
      equipment: [{ name: "Racket", quantityAvailable: 4 }],
      documents: [{ originalName: "license.pdf", mimeType: "application/pdf", sizeBytes: 1200, status: "PENDING", download: { documentId, procedure: "documents.download" } }],
      reviews: [{ rating: 5, status: "PENDING" }],
      bookingCount: 2,
    });
  });

  it("forbids a different owner from retrieving another owner’s arena or document data", async () => {
    configureOwnerRecord("owner-2");
    await expect(arenaHubRouter.createCaller(context("owner-2")).owner.arenaRecord({ arenaId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("forbids a player profile from using the owner record procedure", async () => {
    profileFindOne.mockReturnValue({ lean: vi.fn(async () => ({ openId: "player-1", role: "PLAYER", active: true })) });
    await expect(arenaHubRouter.createCaller(context("player-1")).owner.arenaRecord({ arenaId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

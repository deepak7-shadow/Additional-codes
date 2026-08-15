import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const profileFindOne = vi.fn();
const arenaFindById = vi.fn();
const arenaFindByIdAndUpdate = vi.fn();
const documentCreate = vi.fn();
const documentFind = vi.fn();
const documentFindOne = vi.fn();
const bookingFind = vi.fn();
const storagePut = vi.fn();
const equipmentFindById = vi.fn();
const arenaFindOne = vi.fn();

vi.mock("./storage", () => ({ storagePut }));

vi.mock("./arenahub", async () => {
  const actual = await vi.importActual<typeof import("./arenahub")>("./arenahub");
  return {
    ...actual,
    getArenaHubDatabase: vi.fn(async () => ({})),
    Profile: { findOne: profileFindOne },
    Arena: { findById: arenaFindById, findByIdAndUpdate: arenaFindByIdAndUpdate, findOne: arenaFindOne },
    ArenaDocument: { create: documentCreate, find: documentFind, findOne: documentFindOne },
    Equipment: { findById: equipmentFindById },
    Booking: { find: bookingFind },
  };
});

const { arenaHubRouter } = await import("./arenaHub.router");

const arenaId = "64b64c63f496f38a998f01aa";
const id = (value: string) => ({ toString: () => value });

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

function configureOwner(openId = "owner-1") {
  profileFindOne.mockReturnValue({ lean: vi.fn(async () => ({ openId, role: "OWNER", active: true })) });
}

function lean<T>(value: T) {
  return { lean: vi.fn(async () => value) };
}

describe("ArenaHub owner venue revisions and document history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies a verified owner's venue change by resetting the actual arena record to pending review", async () => {
    configureOwner();
    arenaFindById.mockReturnValue(lean({ _id: id(arenaId), ownerOpenId: "owner-1", status: "APPROVED", verificationStatus: "APPROVED" }));
    arenaFindByIdAndUpdate.mockReturnValue(lean({ _id: id(arenaId), name: "Updated Arena", status: "PENDING", verificationStatus: "PENDING" }));

    const result = await arenaHubRouter.createCaller(context("owner-1")).owner.updateArena({
      arenaId,
      name: "Updated Arena",
      description: "A substantially updated, clear venue description for the verification review team.",
      sports: ["Badminton"],
      address: "21 Court Street, Central District",
      city: "Bengaluru",
      latitude: 12.9716,
      longitude: 77.5946,
    });

    expect(result).toMatchObject({ name: "Updated Arena", status: "PENDING", verificationStatus: "PENDING" });
    expect(arenaFindByIdAndUpdate).toHaveBeenCalledWith(
      arenaId,
      expect.objectContaining({ $set: expect.objectContaining({ status: "PENDING", verificationStatus: "PENDING", rejectionReason: undefined, location: { address: "21 Court Street, Central District", city: "Bengaluru", latitude: 12.9716, longitude: 77.5946 } }) }),
      { new: true },
    );
  });

  it("denies a non-owner before applying any venue revision", async () => {
    configureOwner("owner-2");
    arenaFindById.mockReturnValue(lean({ _id: id(arenaId), ownerOpenId: "owner-1" }));

    await expect(arenaHubRouter.createCaller(context("owner-2")).owner.updateArena({
      arenaId,
      name: "Attempted Edit",
      description: "This owner does not have permission to edit this arena and must be denied safely.",
      sports: ["Badminton"],
      address: "21 Court Street, Central District",
      city: "Bengaluru",
      latitude: 12.9716,
      longitude: 77.5946,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(arenaFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("retains existing documents and persists each follow-up upload as a separate pending review item", async () => {
    configureOwner();
    const documents: Array<Record<string, unknown>> = [{ _id: id("document-existing"), ownerOpenId: "owner-1", originalName: "license.pdf", mimeType: "application/pdf", sizeBytes: 1200, caption: "Initial operating license", status: "APPROVED" }];
    storagePut.mockImplementation(async (key: string) => ({ key: `stored/${key}` }));
    documentCreate.mockImplementation(async (document: Record<string, unknown>) => {
      const created = { ...document, _id: id(`document-${documents.length + 1}`) };
      documents.push(created);
      return created;
    });
    documentFind.mockReturnValue({ sort: vi.fn(() => ({ lean: vi.fn(async () => [...documents].reverse()) })) });
    bookingFind.mockReturnValue({ select: vi.fn(() => ({ lean: vi.fn(async () => []) })) });

    const caller = arenaHubRouter.createCaller(context("owner-1"));
    await caller.documents.upload({
      kind: "VERIFICATION_DOCUMENT",
      originalName: "fire-clearance.pdf",
      mimeType: "application/pdf",
      base64: Buffer.from("new verification document").toString("base64"),
      caption: "Current fire clearance certificate",
    });
    await caller.documents.upload({
      kind: "VERIFICATION_DOCUMENT",
      originalName: "insurance.pdf",
      mimeType: "application/pdf",
      base64: Buffer.from("new insurance document").toString("base64"),
    });
    const history = await caller.documents.mine();

    expect(documents).toHaveLength(3);
    expect(documents.slice(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerOpenId: "owner-1", originalName: "fire-clearance.pdf", mimeType: "application/pdf", status: "PENDING", caption: "Current fire clearance certificate" }),
      expect.objectContaining({ ownerOpenId: "owner-1", originalName: "insurance.pdf", mimeType: "application/pdf", status: "PENDING" }),
    ]));
    expect(history).toHaveLength(3);
    expect(history.map(document => document.originalName)).toEqual(expect.arrayContaining(["license.pdf", "fire-clearance.pdf", "insurance.pdf"]));
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: "license.pdf", mimeType: "application/pdf", sizeBytes: 1200, caption: "Initial operating license", status: "APPROVED" }),
    ]));
    expect(storagePut).toHaveBeenCalledTimes(2);
  });

  it("creates secure equipment-photo metadata and attaches the uploaded document only to the owner's equipment", async () => {
    configureOwner();
    storagePut.mockResolvedValue({ key: "stored/arenahub/owner-1/equipment_photo/racket.webp" });
    const uploadedDocument = {
      _id: id("64b64c63f496f38a998f01bb"),
      ownerOpenId: "owner-1",
      kind: "EQUIPMENT_PHOTO",
      originalName: "racket.webp",
      mimeType: "image/webp",
      sizeBytes: 18,
      storageKey: "stored/arenahub/owner-1/equipment_photo/racket.webp",
      caption: "Match rackets",
      status: "PENDING",
    };
    documentCreate.mockResolvedValue(uploadedDocument);
    documentFindOne.mockResolvedValue(uploadedDocument);
    const equipment = { _id: id("64b64c63f496f38a998f01cc"), arenaId: id(arenaId), photoIds: [] as Array<{ toString(): string }>, save: vi.fn(async () => undefined) };
    equipmentFindById.mockResolvedValue(equipment);
    arenaFindOne.mockReturnValue(lean({ _id: id(arenaId), ownerOpenId: "owner-1" }));

    const caller = arenaHubRouter.createCaller(context("owner-1"));
    const uploaded = await caller.documents.upload({
      kind: "EQUIPMENT_PHOTO",
      originalName: "racket.webp",
      mimeType: "image/webp",
      base64: Buffer.from("equipment-photo-data").toString("base64"),
      caption: "Match rackets",
    });
    const attached = await caller.owner.attachEquipmentPhoto({ equipmentId: "64b64c63f496f38a998f01cc", documentId: "64b64c63f496f38a998f01bb" });

    expect(storagePut).toHaveBeenCalledWith("arenahub/owner-1/equipment_photo/racket.webp", expect.any(Buffer), "image/webp");
    expect(uploaded).toMatchObject({ kind: "EQUIPMENT_PHOTO", storageKey: uploadedDocument.storageKey, status: "PENDING" });
    expect(equipment.photoIds.map(photoId => photoId.toString())).toEqual(["64b64c63f496f38a998f01bb"]);
    expect(equipment.save).toHaveBeenCalledTimes(1);
    expect(attached).toBe(equipment);
  });
});

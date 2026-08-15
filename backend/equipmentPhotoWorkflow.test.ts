import { describe, expect, it, vi } from "vitest";
import { runEquipmentPhotoAttachment } from "../frontend/src/lib/equipmentPhotoWorkflow";

describe("owner equipment-photo client workflow", () => {
  it("shows the attachment error to the owner without refreshing inventory when attachment fails", async () => {
    const upload = vi.fn(async () => ({ id: "document-1" }));
    const attach = vi.fn(async () => { throw new Error("The selected equipment item is no longer available."); });
    const refreshInventory = vi.fn(async () => undefined);

    const result = await runEquipmentPhotoAttachment({ upload, attach, refreshInventory });

    expect(result).toEqual({ ok: false, message: "The selected equipment item is no longer available." });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith({ id: "document-1" });
    expect(refreshInventory).not.toHaveBeenCalled();
  });

  it("refreshes owner inventory after successful secure photo attachment", async () => {
    const upload = vi.fn(async () => ({ id: "document-1" }));
    const attach = vi.fn(async () => undefined);
    const refreshInventory = vi.fn(async () => undefined);

    const result = await runEquipmentPhotoAttachment({ upload, attach, refreshInventory });

    expect(result).toEqual({ ok: true, message: "Equipment photograph uploaded and attached for review." });
    expect(attach).toHaveBeenCalledWith({ id: "document-1" });
    expect(refreshInventory).toHaveBeenCalledTimes(1);
  });
});

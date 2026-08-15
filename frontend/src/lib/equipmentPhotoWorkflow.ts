export type EquipmentPhotoWorkflowResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type EquipmentPhotoWorkflowDependencies<TDocument> = {
  upload: () => Promise<TDocument>;
  attach: (document: TDocument) => Promise<unknown>;
  refreshInventory: () => Promise<unknown> | unknown;
};

export async function runEquipmentPhotoAttachment<TDocument>({ upload, attach, refreshInventory }: EquipmentPhotoWorkflowDependencies<TDocument>): Promise<EquipmentPhotoWorkflowResult> {
  try {
    const document = await upload();
    await attach(document);
    await refreshInventory();
    return { ok: true, message: "Equipment photograph uploaded and attached for review." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The equipment photograph could not be uploaded." };
  }
}

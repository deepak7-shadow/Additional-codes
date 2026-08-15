import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("owner dashboard workflow UI contracts", () => {
  const arenaHubPages = readProjectFile("frontend/src/pages/ArenaHubPages.tsx");
  const playerDashboard = readProjectFile("frontend/src/components/PlayerDashboardV2.tsx");

  it("provides direct secure equipment-photo selection, upload, and attachment from the owner dashboard", () => {
    expect(arenaHubPages).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(arenaHubPages).toContain('uploadDocument.mutateAsync({ kind: "EQUIPMENT_PHOTO"');
    expect(arenaHubPages).toContain("attachEquipmentPhoto.mutateAsync");
    expect(arenaHubPages).toContain("runEquipmentPhotoAttachment");
    expect(arenaHubPages).toContain("setPhotoMessage(result.message)");
    expect(arenaHubPages).toContain('setPhotoMessage(error instanceof Error ? error.message : "The equipment photograph could not be uploaded.")');
  });

  it("uses AM/PM operating-hour controls rather than raw 24-hour number fields", () => {
    expect(arenaHubPages).toContain("courtStartHourOptions.map");
    expect(arenaHubPages).toContain("courtEndHourOptions.map");
    expect(arenaHubPages).toContain("Opening and closing times use AM/PM format");
    expect(arenaHubPages).toContain("weeklyAvailabilityFromHours(court.start, court.end)");
  });

  it("shows account-separation gates for Player booking and Arena Owner setup", () => {
    expect(arenaHubPages).toContain('profile.data?.role === "PLAYER"');
    expect(arenaHubPages).toContain('profile.data?.role === "OWNER"');
    expect(playerDashboard).toContain('profile.data?.role === "OWNER"');
    expect(playerDashboard).toContain("Arena Owner profile cannot book courts");
    expect(arenaHubPages).toContain("Administrator accounts cannot manage arenas.");
  });
});

export type BookingHistoryItem = {
  reference: string;
  sport: string;
  status: string;
  slotStart: Date | string;
  createdAt: Date | string;
  subtotal: number;
};

export type BookingHistoryControls = {
  query: string;
  sport?: string;
  status: string;
  dateWindow: string;
  sort: string;
  now?: number;
};

export function filterAndSortBookings<T extends BookingHistoryItem>(items: T[], controls: BookingHistoryControls): T[] {
  const now = controls.now ?? Date.now();
  const query = controls.query.trim().toLowerCase();
  const day = 86_400_000;

  return items
    .filter(item => {
      const slotStart = new Date(item.slotStart).getTime();
      const matchesQuery = !query || `${item.reference} ${item.sport}`.toLowerCase().includes(query);
      const matchesSport = !controls.sport || controls.sport === "all" || item.sport.toLowerCase() === controls.sport.toLowerCase();
      const matchesStatus = controls.status === "all" || item.status === controls.status;
      const matchesDate = controls.dateWindow === "all"
        || (controls.dateWindow === "upcoming" && slotStart >= now)
        || (controls.dateWindow === "past" && slotStart < now)
        || (controls.dateWindow === "30-days" && slotStart >= now && slotStart <= now + 30 * day);
      return matchesQuery && matchesSport && matchesStatus && matchesDate;
    })
    .sort((left, right) => {
      if (controls.sort === "slot-asc") return new Date(left.slotStart).getTime() - new Date(right.slotStart).getTime();
      if (controls.sort === "created-desc") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (controls.sort === "cost-desc") return right.subtotal - left.subtotal;
      return new Date(right.slotStart).getTime() - new Date(left.slotStart).getTime();
    });
}

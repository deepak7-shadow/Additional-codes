import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { filterAndSortBookings } from "@/lib/bookingHistory";
import { trpc } from "@/lib/trpc";
import { CalendarClock, FileDown, MapPinned, Star, TicketCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { arenaMapUrl } from "@/lib/arenaMapLink";
import { getWorkspaceRoleIdentity } from "@/lib/roleIdentity";
import { canRequestPlayerDashboardData } from "@/lib/dashboardRouting";

const reviewStatusText: Record<string, string> = {
  PENDING: "Feedback received — awaiting moderation.",
  APPROVED: "Feedback approved and visible on the arena.",
  REJECTED: "Feedback was not approved for publication.",
};

export function PlayerDashboardV2() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdministrator = user?.role === "admin";
  const profile = trpc.arenaHub.profile.mine.useQuery(undefined, { enabled: isAuthenticated && !isAdministrator });
  const chooseRole = trpc.arenaHub.profile.chooseRole.useMutation({ onSuccess: () => { profile.refetch(); setLocation("/player/dashboard"); } });
  const canLoadPlayerData = canRequestPlayerDashboardData(user?.role, profile.data?.role);
  const bookings = trpc.arenaHub.booking.mine.useQuery(undefined, { enabled: canLoadPlayerData });
  const reviewStatuses = trpc.arenaHub.booking.reviewStatuses.useQuery(undefined, { enabled: canLoadPlayerData });
  const cancelBooking = trpc.arenaHub.booking.cancel.useMutation({ onSuccess: () => bookings.refetch() });
  const downloadBookingDocument = trpc.arenaHub.booking.downloadDocument.useMutation({ onSuccess: document => {
    const link = window.document.createElement("a");
    link.href = document.url;
    link.download = document.fileName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  } });
  const submitReview = trpc.arenaHub.booking.submitReview.useMutation({ onSuccess: () => { bookings.refetch(); reviewStatuses.refetch(); } });
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateWindow, setDateWindow] = useState("all");
  const [sort, setSort] = useState("slot-desc");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  const sports = useMemo(() => Array.from(new Set((bookings.data ?? []).map(booking => booking.sport))).sort(), [bookings.data]);
  const items = useMemo(() => filterAndSortBookings(bookings.data ?? [], { query, sport, status, dateWindow, sort }), [bookings.data, query, sport, status, dateWindow, sort]);
  const statuses = useMemo(() => new Map((reviewStatuses.data ?? []).map(review => [review.bookingId, review.status])), [reviewStatuses.data]);
  const reset = () => { setQuery(""); setSport("all"); setStatus("all"); setDateWindow("all"); setSort("slot-desc"); };

  if (!isAuthenticated) return <main className="app-shell inner-shell"><section className="role-activation"><div><p className="eyebrow">PLAYER PROFILE</p><h1>Your game plan awaits.</h1><p>Sign in to access your booking activity and eligible venue feedback.</p></div></section></main>;
  if (isAdministrator) return <main className="app-shell inner-shell"><section className="role-activation"><div><p className="eyebrow">ADMINISTRATOR WORKSPACE</p><h1>Opening your <em>administrative dashboard.</em></h1><p>Administrator accounts do not load Player booking data.</p></div><Link href="/admin/dashboard"><Button className="button-copper">Open administrator workspace</Button></Link></section></main>;
  if (profile.data?.role === "OWNER") return <main className="app-shell inner-shell"><section className="role-activation"><div><p className="eyebrow">PLAYER BOOKINGS</p><h1>This email is an <em>Arena Owner</em> account.</h1><p>For account separation, an Arena Owner profile cannot book courts. Use a different email address for Player bookings.</p></div><Link href="/owner/dashboard"><Button className="button-copper">Open owner workspace</Button></Link></section></main>;
  if (profile.data?.role !== "PLAYER") return <main className="app-shell inner-shell"><section className="role-activation"><div><p className="eyebrow">PLAYER MODE</p><h1>Set up your player profile.</h1><p>Player access keeps bookings, confirmations, receipts, and venue feedback attached to your own account.</p></div><form onSubmit={event => { event.preventDefault(); chooseRole.mutate({ role: "PLAYER", displayName: name }); }}><Input value={name} onChange={event => setName(event.target.value)} placeholder="Your full name" minLength={2} required /><Button className="button-copper" type="submit" disabled={chooseRole.isPending}>Activate player profile</Button>{chooseRole.error && <p className="form-error">{chooseRole.error.message}</p>}</form></section></main>;

  const playerIdentity = getWorkspaceRoleIdentity("/player/dashboard")!;
  return <main className="app-shell inner-shell"><section className="dashboard-top player-top"><div><span className={`workspace-role workspace-role-${playerIdentity.tone}`}>{playerIdentity.workspaceLabel}</span><p className="eyebrow">PLAYER PROFILE</p><h1>Manage every <em>game day.</em></h1></div><Link href="/discover"><Button className="button-copper">Discover arenas</Button></Link></section><section className="dashboard-panels"><article className="booking-panel"><div><p className="eyebrow">YOUR BOOKINGS</p><h2>History, feedback, and next moves.</h2></div><div className="booking-tools"><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reference or sport" aria-label="Search booking history" /><Select value={sport} onValueChange={setSport}><SelectTrigger aria-label="Filter booking sport"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sports</SelectItem>{sports.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filter booking status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="PENDING_PAYMENT">Payment pending</SelectItem><SelectItem value="CONFIRMED">Confirmed</SelectItem><SelectItem value="COMPLETED">Completed</SelectItem><SelectItem value="CANCELLED">Cancelled</SelectItem></SelectContent></Select><Select value={dateWindow} onValueChange={setDateWindow}><SelectTrigger aria-label="Filter booking date"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All dates</SelectItem><SelectItem value="upcoming">Upcoming</SelectItem><SelectItem value="past">Past</SelectItem><SelectItem value="30-days">Next 30 days</SelectItem></SelectContent></Select><Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="Sort booking history"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="slot-desc">Slot: newest first</SelectItem><SelectItem value="slot-asc">Slot: oldest first</SelectItem><SelectItem value="created-desc">Booked: newest first</SelectItem><SelectItem value="cost-desc">Cost: highest first</SelectItem></SelectContent></Select><Button type="button" size="sm" variant="outline" onClick={reset}><X />Reset</Button></div>{bookings.isLoading ? <Skeleton className="h-32 w-full" /> : items.length ? <div className="booking-list">{items.map(booking => { const id = booking._id.toString(); const reviewStatus = statuses.get(id); const mapUrl = arenaMapUrl(booking.arena?.location); const canDownloadDocument = ["CONFIRMED", "COMPLETED"].includes(booking.status) && booking.payment?.status === "PAID"; return <div key={id} className="booking-history-row"><TicketCheck /><div><strong>{booking.reference}</strong><span>{booking.sport} · {new Date(booking.slotStart).toLocaleString()} · ₹{booking.subtotal.toLocaleString()}</span>{booking.arena?.name && <small className="booking-arena-name">{booking.arena.name}</small>}{booking.status === "COMPLETED" && (reviewStatus ? <small className="review-status">{reviewStatusText[reviewStatus] ?? `Feedback status: ${reviewStatus}`}</small> : <form className="review-form" onSubmit={event => { event.preventDefault(); const rating = ratings[id]; if (rating) submitReview.mutate({ bookingId: id, rating, comment: comments[id]?.trim() || undefined }); }}><span className="rating-picker" aria-label={`Rate booking ${booking.reference}`}>{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} aria-label={`${value} star${value === 1 ? "" : "s"}`} className={value <= (ratings[id] ?? 0) ? "selected" : ""} onClick={() => setRatings(previous => ({ ...previous, [id]: value }))}><Star /></button>)}</span><Input value={comments[id] ?? ""} onChange={event => setComments(previous => ({ ...previous, [id]: event.target.value }))} placeholder="Share venue feedback (optional)" minLength={3} maxLength={1200} /><Button type="submit" size="sm" variant="outline" disabled={!ratings[id] || submitReview.isPending}>Submit feedback</Button>{submitReview.error && <small className="form-error">{submitReview.error.message}</small>}</form>)}</div><div className="booking-row-actions"><span className="status-pill">{booking.status}</span>{canDownloadDocument && <Button size="sm" variant="outline" onClick={() => downloadBookingDocument.mutate({ bookingId: id })} disabled={downloadBookingDocument.isPending} aria-label={`Download booking document for ${booking.reference}`}><FileDown />Document</Button>}{mapUrl && <Button size="sm" variant="outline" onClick={() => window.open(mapUrl, "_blank", "noopener,noreferrer")} aria-label={`Open exact location for ${booking.arena?.name ?? "this arena"}`}><MapPinned />Map</Button>}{["PENDING_PAYMENT", "CONFIRMED"].includes(booking.status) && <Button size="sm" variant="outline" onClick={() => cancelBooking.mutate({ bookingId: id })} disabled={cancelBooking.isPending}>Cancel</Button>}</div></div>; })}</div> : <div className="quiet-state"><CalendarClock /><p>{bookings.data?.length ? "No bookings match the selected filters." : "Your confirmed court slots and eligible venue feedback will appear here."}</p></div>}</article></section></main>;
}

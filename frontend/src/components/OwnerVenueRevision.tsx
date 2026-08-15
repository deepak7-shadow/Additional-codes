import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, FileCheck2, PencilLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArenaLocationPicker } from "@/components/ArenaLocationPicker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { PublicNav } from "@/pages/ArenaHubPages";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";

export function OwnerVenueRevision() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const arenas = trpc.arenaHub.owner.myArenas.useQuery();
  const [arenaId, setArenaId] = useState("");
  const resolvedArenaId = arenaId || arenas.data?.[0]?._id.toString() || "";
  const activeArena = arenas.data?.find((arena) => arena._id.toString() === resolvedArenaId) ?? arenas.data?.[0];
  const [form, setForm] = useState({ name: "", description: "", sports: "", address: "", city: "", latitude: "", longitude: "" });
  const [locationMessage, setLocationMessage] = useState("");
  const update = trpc.arenaHub.owner.updateArena.useMutation({ onSuccess: () => arenas.refetch() });

  useEffect(() => {
    if (!activeArena) return;
    setArenaId(activeArena._id.toString());
    setForm({
      name: activeArena.name,
      description: activeArena.description,
      sports: activeArena.sports.join(", "),
      address: activeArena.location.address,
      city: activeArena.location.city,
      latitude: String(activeArena.location.latitude),
      longitude: String(activeArena.location.longitude),
    });
  }, [activeArena?._id]);

  if (!isAuthenticated) return <main className="app-shell inner-shell"><PublicNav /><section className="mx-auto mt-24 max-w-xl rounded-2xl border border-cyan-200/20 bg-slate-950/70 p-10 text-center text-white shadow-2xl"><ShieldCheck className="mx-auto mb-4 h-9 w-9 text-cyan-300" /><p className="eyebrow">OWNER-ONLY WORKSPACE</p><h2 className="mt-3 text-3xl font-bold">Sign in to update a venue.</h2><p className="mt-4 text-slate-300">Only the verified owner of a submitted arena can change venue details or add private supporting documents.</p><Button className="button-copper mt-7" onClick={() => startLogin()}>Sign in to continue <ArrowRight /></Button></section></main>;
  if (arenas.isLoading || authLoading) return <main className="app-shell inner-shell"><PublicNav /><section className="mx-auto mt-24 max-w-xl rounded-2xl border border-cyan-200/20 bg-slate-950/70 p-10 text-center text-white shadow-2xl"><Skeleton className="mx-auto h-8 w-8 rounded-full" /><p className="mt-5 text-slate-300">Loading your protected venue record…</p></section></main>;
  if (!arenas.data?.length) return <main className="app-shell inner-shell"><PublicNav /><section className="gate-card"><ShieldCheck /><h2>Submit an arena first.</h2><p>Once you submit a real venue, you can return here to revise its details or add supporting documentation.</p><Link href="/owner"><Button className="button-copper">Open owner workspace <ArrowRight /></Button></Link></section></main>;

  return <main className="app-shell inner-shell"><PublicNav /><section className="owner-dashboard"><div className="dashboard-top"><div><p className="eyebrow">PRIVATE OWNER WORKSPACE</p><h1>Update a submitted venue.</h1><p>Edits return the listing to review. The arena stays out of discovery until the named administrator approves it again.</p></div><Link href="/owner"><Button variant="outline">Back to owner workspace <ArrowRight /></Button></Link></div><section className="owner-dashboard-grid"><article className="create-arena-card"><p className="eyebrow">VENUE REVISION</p><div className="form-stack"><Select value={resolvedArenaId} onValueChange={setArenaId}><SelectTrigger><SelectValue placeholder="Choose a submitted venue" /></SelectTrigger><SelectContent>{arenas.data.map((arena) => <SelectItem key={arena._id.toString()} value={arena._id.toString()}>{arena.name} · {arena.status}</SelectItem>)}</SelectContent></Select><form onSubmit={(event) => { event.preventDefault(); if (!activeArena) return; const latitude = Number(form.latitude); const longitude = Number(form.longitude); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) { setLocationMessage("Choose the arena’s exact location on the map before saving this revision."); return; } setLocationMessage(""); update.mutate({ arenaId: activeArena._id.toString(), name: form.name, description: form.description, sports: form.sports.split(",").map((sport) => sport.trim()).filter(Boolean), address: form.address, city: form.city, latitude, longitude }); }}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Venue name" required /><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="City" required /><Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Street address" required /><Input value={form.sports} onChange={(event) => setForm({ ...form, sports: event.target.value })} placeholder="Sports, separated by commas" required /><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the real courts and facilities." minLength={30} required /><ArenaLocationPicker latitude={form.latitude} longitude={form.longitude} onChange={(coordinates) => setForm({ ...form, ...coordinates })} /><Button type="submit" className="button-copper" disabled={update.isPending}>{update.isPending ? "Saving revision…" : "Save and resubmit"} <PencilLine /></Button>{locationMessage && <p className="form-error">{locationMessage}</p>}{update.error && <p className="form-error">{update.error.message}</p>}{update.isSuccess && <p className="form-success">Venue details saved. This listing is pending review again.</p>}</form></div></article><article className="venue-status-card"><p className="eyebrow">ADDITIONAL SUPPORTING DOCUMENTS</p><h3>Keep your evidence current.</h3><p>Use the private document vault to upload additional verification files after your first submission. Each new file is retained in your history and enters review independently.</p>{activeArena?.rejectionReason && <p className="form-error">Current review note: {activeArena.rejectionReason}</p>}<Link href="/documents"><Button variant="outline">Upload additional documents <FileCheck2 /></Button></Link></article></section></section></main>;
}

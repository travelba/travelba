"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DOSSIER_STATUS_LABELS,
  formatMoney,
  type AgencyBooking,
  type AgencyDossier,
  type AgencyDossierHotel,
  type AgencyHotelContact,
  type AgencyPaymentFollowup,
  type AgencyQuote,
  type DossierStatus,
} from "@/lib/agency/types";
import type { HotelAvailability, RoomRate, RoomType } from "@/lib/little-emperors/types";
import { CreditCardWidget } from "@/components/admin/CreditCardWidget";

type Props = {
  initialDossier: AgencyDossier;
  initialHotels: AgencyDossierHotel[];
  initialQuotes: AgencyQuote[];
  initialBookings: AgencyBooking[];
  initialFollowups: AgencyPaymentFollowup[];
  initialContact: AgencyHotelContact | null;
  widgetBaseUrl: string;
};

export function DossierWorkspace({
  initialDossier,
  initialHotels,
  initialQuotes,
  initialBookings,
  initialFollowups,
  initialContact,
  widgetBaseUrl,
}: Props) {
  const [dossier, setDossier] = useState(initialDossier);
  const [hotels, setHotels] = useState(initialHotels);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [bookings, setBookings] = useState(initialBookings);
  const [followups, setFollowups] = useState(initialFollowups);
  const [contact, setContact] = useState(initialContact);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [roomAvailability, setRoomAvailability] = useState<HotelAvailability | null>(null);
  const [selectedRate, setSelectedRate] = useState<{
    room: RoomType;
    rate: RoomRate;
  } | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [guestName, setGuestName] = useState(
    dossier.agency_clients?.name || ""
  );
  const [guestEmail, setGuestEmail] = useState(
    dossier.agency_clients?.email || ""
  );
  const [contactEmails, setContactEmails] = useState(
    (initialContact?.emails || []).join(", ")
  );
  const [paymentLink, setPaymentLink] = useState("");

  const selectedHotelIds = useMemo(
    () => hotels.filter((h) => h.is_selected).map((h) => h.le_hotel_id),
    [hotels]
  );

  async function refreshDossier() {
    const res = await fetch(`/api/admin/dossiers/${dossier.id}`);
    const data = await res.json();
    if (res.ok) {
      setDossier(data.dossier);
      setHotels(data.hotels || []);
      setQuotes(data.quotes || []);
      setBookings(data.bookings || []);
      setFollowups(data.followups || []);
    }
  }

  async function searchAvailability() {
    setBusy("search");
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/admin/dossiers/${dossier.id}/hotels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search" }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Recherche impossible");
      return;
    }
    setHotels(data.hotels || []);
    setMessage(`${(data.hotels || []).length} hôtel(s) trouvé(s)`);
    await refreshDossier();
  }

  async function toggleHotel(hotel: AgencyDossierHotel, exclusive = false) {
    const res = await fetch(`/api/admin/dossiers/${dossier.id}/hotels`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        le_hotel_id: hotel.le_hotel_id,
        is_selected: exclusive ? true : !hotel.is_selected,
        exclusive,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Sélection impossible");
      return;
    }
    await refreshDossier();
  }

  async function generateQuote(quoteType: "hotels" | "rooms", markSent = true) {
    setBusy(`quote-${quoteType}`);
    setError(null);
    const res = await fetch(`/api/admin/dossiers/${dossier.id}/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quote_type: quoteType,
        hotel_ids: quoteType === "hotels" ? selectedHotelIds : undefined,
        mark_sent: markSent,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "PDF impossible");
      return;
    }
    setQuotes((prev) => [data.quote, ...prev]);
    setMessage("PDF généré — téléchargez-le pour WhatsApp");
    if (data.quote?.payload?.sessionId) {
      setDossier((prev) => ({
        ...prev,
        session_id: data.quote.payload.sessionId,
      }));
    }
    if (quoteType === "rooms" && data.quote?.payload?.roomTypes) {
      // keep payload for booking UI
    }
    await refreshDossier();
    if (data.quote?.public_url) {
      window.open(data.quote.public_url, "_blank");
    }
  }

  async function loadRooms() {
    if (!dossier.hotel_id) {
      setError("Choisissez d'abord un hôtel");
      return;
    }
    setBusy("rooms");
    setError(null);
    const res = await fetch("/api/admin/le/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_date: dossier.start_date,
        end_date: dossier.end_date,
        currency: dossier.currency,
        rooms: dossier.rooms,
        hotel_id: dossier.hotel_id,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Disponibilité chambres impossible");
      return;
    }
    const hotel = (data.hotels || [])[0] as HotelAvailability | undefined;
    if (!hotel) {
      setError("Aucune disponibilité");
      return;
    }
    setRoomAvailability(hotel);
    setCardReady(false);
    setSelectedRate(null);
    await fetch(`/api/admin/dossiers/${dossier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: hotel.session_id || null }),
    });
    setDossier((prev) => ({ ...prev, session_id: hotel.session_id || null }));
  }

  async function updateStatus(status: DossierStatus) {
    const res = await fetch(`/api/admin/dossiers/${dossier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok) setDossier(data.dossier);
  }

  async function createBooking() {
    if (!selectedRate || !dossier.session_id || !dossier.hotel_id) {
      setError("Sélectionnez un tarif et chargez les chambres");
      return;
    }
    if (!cardReady) {
      setError("Validez d'abord la carte dans le widget Little Emperors");
      return;
    }
    setBusy("book");
    setError(null);
    const res = await fetch("/api/admin/le/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dossier_id: dossier.id,
        start_date: dossier.start_date,
        end_date: dossier.end_date,
        session_id: dossier.session_id,
        rate_index: selectedRate.rate.rate_index,
        hotel_id: dossier.hotel_id,
        guest_name: guestName,
        guest_email: guestEmail,
        rooms: dossier.rooms,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Réservation impossible");
      return;
    }
    setMessage(`Réservation créée — ${data.booking?.confirmation_number || data.booking?.le_booking_id}`);
    await refreshDossier();
  }

  async function saveContact() {
    if (!dossier.hotel_id) return;
    const emails = contactEmails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    const res = await fetch("/api/admin/hotel-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        le_hotel_id: dossier.hotel_id,
        hotel_name: dossier.hotel_name,
        emails,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Contacts non enregistrés");
      return;
    }
    setContact(data.contact);
    setMessage("Contacts hôtel enregistrés");
  }

  async function sendFollowup() {
    const emails = contactEmails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!emails.length) {
      setError("Ajoutez au moins un email hôtel");
      return;
    }
    setBusy("followup");
    const res = await fetch(`/api/admin/dossiers/${dossier.id}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_emails: emails,
        send: true,
        booking_id: bookings[0]?.id,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Envoi impossible");
      return;
    }
    setFollowups((prev) => [data.followup, ...prev]);
    setMessage("Email de demande de lien de paiement envoyé");
    await refreshDossier();
  }

  async function savePaymentLink() {
    if (!followups[0] || !paymentLink) return;
    const res = await fetch(`/api/admin/dossiers/${dossier.id}/followup`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        followup_id: followups[0].id,
        payment_link: paymentLink,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Lien non enregistré");
      return;
    }
    setFollowups((prev) =>
      prev.map((f) => (f.id === data.followup.id ? data.followup : f))
    );
    setMessage("Lien de paiement enregistré");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-muted hover:text-foreground">
            ← Pipeline
          </Link>
          <h1 className="mt-2 font-display text-3xl tracking-tight">
            {dossier.title || dossier.destination_text}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {dossier.start_date} → {dossier.end_date} · {dossier.currency} ·{" "}
            {dossier.agency_clients?.name || "Sans client"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs">
            {DOSSIER_STATUS_LABELS[dossier.status]}
          </span>
          <select
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            value={dossier.status}
            onChange={(e) => updateStatus(e.target.value as DossierStatus)}
          >
            {Object.entries(DOSSIER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message ? (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-accent-3/40 bg-accent-3/10 px-3 py-2 text-sm text-accent-3">
          {error}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-border bg-surface/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">1. Disponibilités hôtels</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={searchAvailability}
              disabled={busy === "search"}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "search" ? "Recherche…" : "Lancer la recherche LE"}
            </button>
            <button
              type="button"
              onClick={() => generateQuote("hotels", true)}
              disabled={busy === "quote-hotels" || hotels.length === 0}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
            >
              PDF devis hôtels
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2/70 text-muted">
              <tr>
                <th className="px-3 py-2">Hôtel</th>
                <th className="px-3 py-2">À partir de</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hotels.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted">
                    Lancez une recherche pour lister les hôtels.
                  </td>
                </tr>
              ) : (
                hotels.map((hotel) => (
                  <tr key={hotel.id} className="border-t border-border/70">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {hotel.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hotel.image_url}
                            alt=""
                            className="h-14 w-20 shrink-0 rounded-md object-cover bg-surface-2"
                          />
                        ) : (
                          <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[10px] text-muted">
                            Pas d&apos;image
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{hotel.hotel_name}</p>
                          <p className="text-xs text-muted">
                            {hotel.location || "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {formatMoney(hotel.lowest_rate, hotel.currency_code || dossier.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleHotel(hotel)}
                          className="text-xs text-accent-2"
                        >
                          {hotel.is_selected ? "Retirer du devis" : "Inclure au devis"}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleHotel(hotel, true)}
                          className="text-xs text-foreground"
                        >
                          Choisir cet hôtel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">2. Chambres & tarifs</h2>
            <p className="text-sm text-muted">
              Hôtel sélectionné : {dossier.hotel_name || "aucun"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadRooms}
              disabled={!dossier.hotel_id || busy === "rooms"}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "rooms" ? "Chargement…" : "Charger les chambres LE"}
            </button>
            <button
              type="button"
              onClick={() => generateQuote("rooms", true)}
              disabled={!dossier.hotel_id || busy === "quote-rooms"}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
            >
              PDF devis chambres
            </button>
            <button
              type="button"
              onClick={() => updateStatus("client_approved")}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-white/5"
            >
              Marquer client validé
            </button>
          </div>
        </div>

        {roomAvailability ? (
          <div className="space-y-4">
            {(roomAvailability.room_types || []).map((room) => (
              <div key={room.id} className="rounded-lg border border-border/80 p-4">
                <div className="flex gap-4">
                  {room.images?.[0]?.thumbnail_url || room.images?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        room.images[0].thumbnail_url || room.images[0].url || ""
                      }
                      alt=""
                      className="h-24 w-32 shrink-0 rounded-md object-cover bg-surface-2"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                <h3 className="font-medium">{room.name}</h3>
                {room.description ? (
                  <p className="mt-1 text-sm text-muted">{room.description}</p>
                ) : null}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {(room.rates || []).map((rate) => {
                    const active =
                      selectedRate?.rate.rate_index === rate.rate_index;
                    return (
                      <button
                        key={rate.rate_index}
                        type="button"
                        onClick={() => {
                          setSelectedRate({ room, rate });
                          setCardReady(false);
                        }}
                        className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
                          active
                            ? "border-accent bg-accent/10"
                            : "border-border hover:bg-white/5"
                        }`}
                      >
                        <div>
                          <p className="font-medium">{rate.title || "Tarif"}</p>
                          <p className="text-xs text-muted">
                            {rate.cancellation_policy || rate.payment_description}
                          </p>
                        </div>
                        <p className="shrink-0 font-medium">
                          {formatMoney(
                            rate.total_to_book_in_requested_currency ??
                              rate.total_to_book,
                            rate.requested_currency_code || rate.currency_code
                          )}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Chargez les chambres après le choix client.
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface/40 p-5">
        <h2 className="font-display text-xl">3. Réservation Little Emperors</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted">Nom du client (prénom + nom)</span>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted">Email client</span>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2"
            />
          </label>
        </div>

        {dossier.session_id && selectedRate ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Tarif sélectionné : {selectedRate.room.name} ·{" "}
              {selectedRate.rate.title} ·{" "}
              {formatMoney(
                selectedRate.rate.total_to_book_in_requested_currency ??
                  selectedRate.rate.total_to_book,
                selectedRate.rate.requested_currency_code ||
                  selectedRate.rate.currency_code
              )}
            </p>
            <CreditCardWidget
              sessionId={dossier.session_id}
              widgetBaseUrl={widgetBaseUrl}
              onSuccess={() => {
                setCardReady(true);
                setMessage("Carte enregistrée auprès de Little Emperors");
              }}
              onError={(msg) => setError(msg)}
            />
            <button
              type="button"
              onClick={createBooking}
              disabled={busy === "book" || !cardReady}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "book" ? "Réservation…" : "Confirmer la réservation LE"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Sélectionnez un tarif pour afficher le widget carte bancaire.
          </p>
        )}

        {bookings.length > 0 ? (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">Dernière réservation</p>
            <p className="text-muted">
              {bookings[0].hotel_name} · conf.{" "}
              {bookings[0].confirmation_number || bookings[0].le_booking_id} ·{" "}
              {bookings[0].total_cost} {bookings[0].currency} ·{" "}
              {bookings[0].state}
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface/40 p-5">
        <h2 className="font-display text-xl">4. Paiement hôtel</h2>
        <p className="text-sm text-muted">
          Les emails contact ne sont pas fournis par l&apos;API LE — saisissez-les
          ici, puis demandez le lien de paiement.
        </p>
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted">Emails hôtel (séparés par virgule)</span>
          <input
            value={contactEmails}
            onChange={(e) => setContactEmails(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
            placeholder="reservations@hotel.com, sales@hotel.com"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveContact}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-white/5"
          >
            Enregistrer contacts
          </button>
          <button
            type="button"
            onClick={sendFollowup}
            disabled={busy === "followup"}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "followup" ? "Envoi…" : "Demander le lien de paiement"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            value={paymentLink}
            onChange={(e) => setPaymentLink(e.target.value)}
            placeholder="Coller le lien de paiement reçu"
            className="min-w-[240px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={savePaymentLink}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-white/5"
          >
            Enregistrer le lien
          </button>
          <button
            type="button"
            onClick={() => updateStatus("paid")}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-white/5"
          >
            Marquer payé
          </button>
        </div>

        {followups.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {followups.map((f) => (
              <li key={f.id} className="rounded-lg border border-border/70 px-3 py-2">
                <p>
                  {f.status} · {f.to_emails.join(", ")}
                </p>
                {f.payment_link ? (
                  <a
                    href={f.payment_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-2 hover:underline"
                  >
                    Lien de paiement
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {contact ? (
          <p className="text-xs text-muted">
            Contacts sauvegardés pour l&apos;hôtel #{contact.le_hotel_id}
          </p>
        ) : null}
      </section>

      {quotes.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-border bg-surface/40 p-5">
          <h2 className="font-display text-xl">PDF générés</h2>
          <ul className="space-y-2 text-sm">
            {quotes.map((quote) => (
              <li key={quote.id} className="flex items-center justify-between gap-3">
                <span>
                  {quote.quote_type === "hotels" ? "Devis hôtels" : "Devis chambres"} ·{" "}
                  {new Date(quote.created_at).toLocaleString("fr-FR")}
                </span>
                {quote.public_url ? (
                  <a
                    href={quote.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-2 hover:underline"
                  >
                    Télécharger
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

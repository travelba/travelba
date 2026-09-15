"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CrmServiceRequest } from "@/lib/crm/types";

type Booking = { id: string; reference: string; title: string };

export function ServiceRequestsManager({ customerId, initialRequests, bookings }: {
  customerId: string;
  initialRequests: CrmServiceRequest[];
  bookings: Booking[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setMessage(null);
    const form = new FormData(formElement);
    const payload = {
      customer_id: customerId,
      booking_id: String(form.get("booking_id") || "") || null,
      category: String(form.get("category") || "assistance"),
      subject: String(form.get("subject") || "").trim(),
      message: String(form.get("message") || "").trim(),
    };
    const { data, error } = await createClient().from("crm_service_requests").insert(payload).select("*").single();
    setPending(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setRequests((current) => [data as CrmServiceRequest, ...current]);
    formElement.reset();
    setMessage("Votre demande a été transmise à l’agence.");
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="account-card grid gap-4 p-5">
        <h2 className="font-display text-lg font-bold">Nouvelle demande</h2>
        <select name="category" className="rounded-xl border border-border bg-white px-3 py-2" required>
          <option value="change">Modifier un voyage</option>
          <option value="cancellation">Demander une annulation</option>
          <option value="document">Obtenir un document</option>
          <option value="assistance">Assistance</option>
          <option value="other">Autre</option>
        </select>
        <select name="booking_id" className="rounded-xl border border-border bg-white px-3 py-2">
          <option value="">Demande générale</option>
          {bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.reference} · {booking.title}</option>)}
        </select>
        <input name="subject" required placeholder="Objet" className="rounded-xl border border-border bg-white px-3 py-2" />
        <textarea name="message" required placeholder="Décrivez votre demande" className="min-h-28 rounded-xl border border-border bg-white px-3 py-2" />
        {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}
        <button disabled={pending} className="rounded-full bg-[var(--admin-navy)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pending ? "Envoi…" : "Envoyer à l’agence"}</button>
      </form>
      <div className="space-y-3">
        {requests.map((request) => (
          <article key={request.id} className="account-card p-5">
            <div className="flex justify-between gap-3"><h2 className="font-semibold">{request.subject}</h2><span className="text-xs font-bold uppercase text-[var(--aura-blue)]">{request.status}</span></div>
            <p className="mt-1 text-sm text-muted">{new Date(request.created_at).toLocaleString("fr-FR")} · {request.category}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm">{request.message}</p>
            {request.staff_response ? <div className="mt-4 rounded-xl bg-[var(--aura-blue-soft)] p-3 text-sm"><strong>Réponse de l’agence</strong><p className="mt-1 whitespace-pre-wrap">{request.staff_response}</p></div> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

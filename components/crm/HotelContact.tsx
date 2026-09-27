"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hotelContact } from "@/lib/crm/hotel-contact";
import type { CrmBookingItem } from "@/lib/crm/types";
import { Icon } from "@/components/crm/icons";

export function HotelContactButton({ item }: { item: CrmBookingItem }) {
  const [open, setOpen] = useState(false);
  const contact = hotelContact(item);
  return (
    <>
      <button
        type="button"
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#9e7e51]"
        aria-label={`Voir l’hôtel ${contact.name}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Icon name="hotel" className="h-3.5 w-3.5" />
        Voir l’hôtel
      </button>
      {open ? <HotelContactDialog item={item} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Row({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">{label}</p>
      <p className="text-sm text-[#0B192C]">{children}</p>
    </div>
  );
}

export function HotelContactDialog({
  item,
  onClose,
}: {
  item: CrmBookingItem;
  onClose: () => void;
}) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const contact = hotelContact(item);
  const hasDetails = Boolean(
    contact.address ||
      contact.city ||
      contact.country ||
      contact.phone ||
      contact.email ||
      contact.website ||
      contact.people.length
  );

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0B192C]/55 p-3 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e5e3dc] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Hôtel</p>
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug text-[#0B192C]">
              {contact.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-[#0B192C]"
            aria-label="Fermer"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 overflow-auto px-4 py-4">
          {contact.city ? <Row label="Ville">{contact.city}</Row> : null}
          {contact.country ? <Row label="Pays">{contact.country}</Row> : null}
          {contact.address ? <Row label="Adresse">{contact.address}</Row> : null}
          {contact.people.length ? (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Contacts</p>
              {contact.people.map((person, index) => (
                <div
                  key={`${person.type}-${person.email}-${person.last_name}-${index}`}
                  className="space-y-1 rounded-2xl border border-[#e5e3dc] px-3 py-2"
                >
                  {person.type ? <Row label="Type">{person.type}</Row> : null}
                  {person.last_name ? <Row label="Nom">{person.last_name}</Row> : null}
                  {person.first_name ? <Row label="Prénom">{person.first_name}</Row> : null}
                  {person.email ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">E-mail</p>
                      <a href={`mailto:${person.email}`} className="text-sm font-semibold text-[#0B192C]">
                        {person.email}
                      </a>
                    </div>
                  ) : null}
                  {person.phone ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Téléphone</p>
                      <a href={`tel:${person.phone.replace(/\s/g, "")}`} className="text-sm font-semibold text-[#0B192C]">
                        {person.phone}
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {contact.phone && !contact.people.some((person) => person.phone === contact.phone) ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Téléphone</p>
              <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="text-sm font-semibold text-[#0B192C]">
                {contact.phone}
              </a>
            </div>
          ) : null}
          {contact.email && !contact.people.some((person) => person.email === contact.email) ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">E-mail</p>
              <a href={`mailto:${contact.email}`} className="text-sm font-semibold text-[#0B192C]">
                {contact.email}
              </a>
            </div>
          ) : null}
          {contact.website ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Site internet</p>
              <p className="break-all text-sm text-[#0B192C]">{contact.website}</p>
              <iframe
                title={`Site de ${contact.name}`}
                src={contact.website}
                sandbox="allow-scripts allow-forms allow-popups"
                className="h-64 w-full rounded-2xl border border-[#e5e3dc] bg-white sm:h-80"
              />
            </div>
          ) : null}
          {!hasDetails ? (
            <p className="text-sm text-[#0B192C]">
              L’agence n’a pas d’autres coordonnées sur cette confirmation.
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

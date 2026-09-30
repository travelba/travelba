"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hotelContact } from "@/lib/crm/hotel-contact";
import type { CrmBookingItem } from "@/lib/crm/types";
import { Icon } from "@/components/crm/icons";

function personLabel(person: { type: string; first_name: string; last_name: string }) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return [person.type, name].filter(Boolean).join(" · ");
}

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
        {contact.people.length
          ? `Voir l’hôtel · ${contact.people.length} contact${contact.people.length > 1 ? "s" : ""}`
          : "Voir l’hôtel"}
      </button>
      {contact.people.length ? (
        <ul className="mt-2 space-y-1">
          {contact.people.map((person, index) => (
            <li key={`${person.type}-${person.email}-${index}`} className="text-xs leading-snug text-[#0B192C]">
              <span className="font-semibold">{personLabel(person) || "Contact"}</span>
              {person.email ? (
                <>
                  {" · "}
                  <a href={`mailto:${person.email}`} className="font-semibold text-[#0B192C]">
                    {person.email}
                  </a>
                </>
              ) : null}
              {person.phone ? ` · ${person.phone}` : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? <HotelContactDialog item={item} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

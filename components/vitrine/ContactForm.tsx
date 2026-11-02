"use client";

import { useMemo, useState } from "react";
import { siteConfig } from "@/lib/site";

export function ContactForm({
  intention,
  voyage,
  titre,
}: {
  intention: string;
  voyage: string;
  titre: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const subject = useMemo(() => {
    if (intention === "itineraire") return `Itinéraire ${titre || voyage}`;
    if (intention === "personnaliser") return `Personnaliser ${titre || voyage}`;
    return titre || "Voyage Travel BA";
  }, [intention, titre, voyage]);

  const body = [
    "Bonjour,",
    "",
    subject,
    name && `Nom : ${name}`,
    email && `E-mail : ${email}`,
    phone && `Téléphone : ${phone}`,
    "",
    message || "Je souhaite en parler avec un conseiller.",
  ]
    .filter(Boolean)
    .join("\n");

  const whatsapp = `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(body)}`;
  const mail = `mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <form
      className="vz-form"
      onSubmit={(event) => {
        event.preventDefault();
        window.location.href = whatsapp;
      }}
    >
      <label>
        Nom
        <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
      </label>
      <label>
        E-mail
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </label>
      <label>
        Téléphone
        <input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
      </label>
      <label>
        Le voyage
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <button type="submit">Écrire sur WhatsApp</button>
      <a className="vz-link" href={mail}>
        Écrire par e-mail
      </a>
      <p>La demande part vers WhatsApp ou votre messagerie. Cette étude ne l’enregistre pas.</p>
    </form>
  );
}

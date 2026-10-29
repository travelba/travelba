import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TabLinks } from "@/components/admin/TabLinks";
import {
  BOITE_TAB_IDS,
  BOITE_TAB_LABELS,
  boiteHref,
  boiteTabFromParam,
  fournisseursViewFromParam,
  hotelsViewFromParam,
  LEGACY_BOITE_ROUTES,
  whatsappThreadHref,
} from "./boite-tabs";
import { filterThreads, inboxFilterFromParam, type InboxThread } from "./whatsapp-inbox";

const root = process.cwd();

function thread(partial: Partial<InboxThread>): InboxThread {
  return {
    key: "k",
    phone: "+33600000000",
    customerId: null,
    customerName: null,
    prospect: true,
    bookingId: null,
    bookingReference: null,
    lastBody: "",
    lastAt: "2026-01-01T00:00:00Z",
    unread: 0,
    status: "robot",
    ...partial,
  };
}

describe("Boîte de réception : trois onglets, une file par source", () => {
  it("les onglets sont Fournisseurs, Hôtels, WhatsApp", () => {
    assert.deepEqual(BOITE_TAB_IDS, ["fournisseurs", "hotels", "whatsapp"]);
    assert.deepEqual(Object.values(BOITE_TAB_LABELS), ["Fournisseurs", "Hôtels", "WhatsApp"]);
  });

  it("un paramètre inconnu ouvre Fournisseurs ; les anciens noms et vues sont des alias", () => {
    assert.equal(boiteTabFromParam(undefined), "fournisseurs");
    assert.equal(boiteTabFromParam("emails"), "fournisseurs");
    assert.equal(boiteTabFromParam("little-emperors"), "fournisseurs");
    assert.equal(boiteTabFromParam(["whatsapp"]), "whatsapp");
    assert.equal(fournisseursViewFromParam("appliques"), "rattaches");
    assert.equal(fournisseursViewFromParam("ignores"), "classes");
    assert.equal(fournisseursViewFromParam("x"), "file");
    assert.equal(hotelsViewFromParam("demandes"), "demandes");
    assert.equal(hotelsViewFromParam(undefined), "reponses");
  });

  it("boiteHref garde la requête utile, et le fil WhatsApp est un lien profond dans la Boîte", () => {
    assert.equal(boiteHref("hotels"), "/admin/boite?onglet=hotels");
    assert.equal(boiteHref("fournisseurs", { vue: null, page: 0, source: "little-emperors" }), "/admin/boite?onglet=fournisseurs&source=little-emperors");
    assert.equal(whatsappThreadHref("+33 6 00"), "/admin/boite?onglet=whatsapp&fil=%2B33+6+00");
  });

  it("chaque ancienne page redirige vers son onglet ; Little Emperors reste la page des partenaires", () => {
    for (const [route, target] of Object.entries(LEGACY_BOITE_ROUTES)) {
      const source = readFileSync(join(root, `app${route}/page.tsx`), "utf8");
      assert.match(source, /redirect\(/, route);
      if (route === "/admin/little-emperors") {
        assert.match(source, /staff\.role !== "partner"/);
        assert.match(source, /crm_le_bookings_partner/);
      } else {
        assert.ok(source.includes(`LEGACY_BOITE_ROUTES["${route}"]`), route);
      }
      assert.equal(target.tab, route === "/admin/whatsapp" ? "whatsapp" : route === "/admin/hotels-demandes" ? "hotels" : "fournisseurs");
    }
  });

  it("la barre d’onglets marque l’onglet ouvert et porte les pastilles", () => {
    const html = renderToStaticMarkup(
      createElement(TabLinks, {
        ariaLabel: "Onglets",
        active: "hotels",
        tabs: BOITE_TAB_IDS.map((id) => ({ id, href: boiteHref(id), label: BOITE_TAB_LABELS[id], count: id === "fournisseurs" ? 7 : 0 })),
      })
    );
    assert.match(html, /aria-current="page"[^>]*href="\/admin\/boite\?onglet=hotels"/);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    assert.match(html, />7</);
  });

  it("À approuver ne garde que les fils avec un brouillon du Concierge en attente", () => {
    const threads = [thread({ key: "a", pending: 2 }), thread({ key: "b", unread: 3 }), thread({ key: "c" })];
    assert.deepEqual(
      filterThreads(threads, { filter: "a-approuver" }).map((row) => row.key),
      ["a"]
    );
    assert.deepEqual(
      filterThreads(threads, { filter: "non-lus" }).map((row) => row.key),
      ["b"]
    );
    assert.equal(inboxFilterFromParam("a-approuver"), "a-approuver");
    assert.equal(inboxFilterFromParam("autre"), "tous");
  });

  it("la file e-mail garde quatre gestes et Écarter le doublon ; Reproposer a disparu", () => {
    const inbox = readFileSync(join(root, "components/admin/EmailIngestInbox.tsx"), "utf8");
    for (const label of ["Déposer les pièces", "Créer un dossier", "Classer", "Écarter le doublon", "Choisir un client"]) {
      assert.ok(inbox.includes(label), label);
    }
    assert.equal(/Reproposer|rematch|Mettre à jour les cartes/.test(inbox), false);
    const le = readFileSync(join(root, "components/admin/LittleEmperorsInbox.tsx"), "utf8");
    assert.equal(le.includes("dossier brouillon"), false);
  });

  it("l’accueil ne porte plus le bloc Réponses d’hôtel : il vit dans Boîte › Hôtels", () => {
    const home = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
    assert.equal(home.includes("RecentMails"), false);
    const hotels = readFileSync(join(root, "components/admin/boite/HotelsPanel.tsx"), "utf8");
    assert.match(hotels, /RecentMails/);
    assert.match(hotels, /UnansweredMails/);
    assert.match(hotels, /HotelSearchDesk/);
  });
});

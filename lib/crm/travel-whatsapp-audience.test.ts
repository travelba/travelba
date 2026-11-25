import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runSpouseDeliveries } from "./travel-whatsapp-fanout";
import { spouseTravelToggleRefusal } from "./travel-whatsapp-toggle";
import {
  ACCOUNT_NOTICE_KINDS,
  companionSafeText,
  isSpouseRelationship,
  planSpouseTravelDeliveries,
  selectTravelWhatsappAudience,
  spouseTravelIntroText,
  travelTextForSpouse,
  type TravelAudienceCompanion,
  type TravelAudienceHolder,
  type TravelAudienceTraveler,
} from "./travel-whatsapp-audience";

const holder: TravelAudienceHolder = {
  id: "holder",
  phone: "+33601020304",
  firstName: "Camille",
  optInAt: "2026-01-01T00:00:00Z",
  optOutAt: null,
};

function spouse(patch: Partial<TravelAudienceCompanion> = {}): TravelAudienceCompanion {
  return {
    id: "spouse",
    customerId: "holder",
    relationship: "conjoint",
    phone: "+33611223344",
    firstName: "Hugo",
    optOutAt: null,
    introSentAt: null,
    ...patch,
  };
}

function traveler(patch: Partial<TravelAudienceTraveler> = {}): TravelAudienceTraveler {
  return {
    id: "traveler",
    companionId: "spouse",
    isAccountHolder: false,
    whatsappTravelUpdates: true,
    ...patch,
  };
}

function audience(input?: {
  travelers?: TravelAudienceTraveler[];
  companions?: TravelAudienceCompanion[];
  holder?: Partial<TravelAudienceHolder>;
  other?: { customerId: string; phone: string | null }[];
}) {
  return selectTravelWhatsappAudience({
    holder: { ...holder, ...input?.holder },
    travelers: input?.travelers || [traveler()],
    companions: input?.companions || [spouse()],
    otherCustomerPhones: input?.other,
  });
}

test("épouse, époux, mari et femme sont des conjoints", () => {
  for (const label of ["conjoint", "Conjoint(e)", "épouse", "epoux", "mari", "femme", "spouse"]) {
    assert.equal(isSpouseRelationship(label), true, label);
  }
  for (const label of ["enfant", "ami", "parent", "famille", "autre", ""]) {
    assert.equal(isSpouseRelationship(label), false, label);
  }
});

test("le conjoint coché par défaut part, le non-conjoint non", () => {
  const selected = audience({
    travelers: [traveler(), traveler({ id: "child", companionId: "child" })],
    companions: [spouse(), spouse({ id: "child", relationship: "enfant", phone: "+33600000001", firstName: "Noa" })],
  });
  assert.deepEqual(
    selected.recipients.map((row) => row.role),
    ["holder", "spouse"]
  );
  assert.equal(selected.recipients[1]?.phone, "+33611223344");
  assert.equal(selected.skipped.some((row) => row.reason === "lien"), true);
});

test("la case décochée, le Stop et le téléphone invalide sortent le conjoint", () => {
  const off = audience({ travelers: [traveler({ whatsappTravelUpdates: false })] });
  assert.equal(off.recipients.some((row) => row.role === "spouse"), false);
  assert.equal(off.skipped[0]?.reason, "decoche");

  const stopped = audience({ companions: [spouse({ optOutAt: "2026-02-01T00:00:00Z" })] });
  assert.equal(stopped.skipped[0]?.reason, "stop");
  assert.equal(stopped.recipients.some((row) => row.phone === "+33611223344"), false);
  assert.equal(stopped.recipients.some((row) => row.role === "holder"), true);

  const bare = audience({ companions: [spouse({ phone: "pas un numero" })] });
  assert.equal(bare.skipped[0]?.reason, "telephone");
});

test("même numéro que le titulaire : un seul envoi", () => {
  const selected = audience({ companions: [spouse({ phone: "06 01 02 03 04" })] });
  assert.equal(selected.recipients.length, 1);
  assert.equal(selected.recipients[0]?.role, "holder");
  assert.equal(selected.skipped[0]?.reason, "doublon");
});

test("un numéro déjà sur une autre fiche ne part pas en double et ne fusionne rien", () => {
  const selected = audience({
    other: [{ customerId: "other", phone: "+33611223344" }],
  });
  assert.equal(selected.recipients.some((row) => row.role === "spouse"), false);
  assert.equal(selected.skipped[0]?.reason, "autre_fiche");
  assert.equal(JSON.stringify(selected).includes("fusion"), false);
});

test("un conjoint de société ne reçoit que le séjour où il est voyageur", () => {
  const onTrip = audience();
  const colleague = selectTravelWhatsappAudience({
    holder: { ...holder, id: "colleague" },
    travelers: [traveler({ companionId: null, isAccountHolder: true })],
    companions: [spouse()],
  });
  assert.equal(onTrip.recipients.some((row) => row.role === "spouse"), true);
  assert.equal(colleague.recipients.some((row) => row.role === "spouse"), false);
});

test("l’argent et le compte ne préparent aucun envoi conjoint", () => {
  const selected = audience();
  for (const kind of ACCOUNT_NOTICE_KINDS) {
    const plan = planSpouseTravelDeliveries({
      kind,
      visible: true,
      body: "Votre relevé est prêt.",
      dossier: "Tel Aviv",
      audience: selected,
    });
    assert.equal(plan.length, 0, kind);
  }
  const hidden = planSpouseTravelDeliveries({
    kind: "pieces",
    visible: false,
    body: "Vos billets sont dans la réservation.",
    dossier: "Tel Aviv",
    audience: selected,
  });
  assert.equal(hidden.length, 0);
});

test("le premier envoi conjoint porte l’explication, une seule fois, sans lien de compte", () => {
  const selected = audience();
  const plan = planSpouseTravelDeliveries({
    kind: "sejour",
    visible: true,
    body: "Votre séjour à Tel Aviv est prêt.\nhttps://travelba.fr/mon-compte/reservations/TB-1",
    dossier: "Tel Aviv",
    audience: selected,
  });
  assert.equal(plan.length, 1);
  assert.match(plan[0]?.intro || "", /informations de voyage de Tel Aviv/);
  assert.match(plan[0]?.intro || "", /Stop/);
  assert.equal(plan[0]?.body.includes("mon-compte"), false);
  assert.match(plan[0]?.body || "", /Tel Aviv/);

  const again = audience({ companions: [spouse({ introSentAt: "2026-03-01T00:00:00Z" })] });
  const second = planSpouseTravelDeliveries({
    kind: "vol",
    visible: true,
    body: "Vol AF123 Paris → Tel Aviv.",
    dossier: "Tel Aviv",
    audience: again,
  });
  assert.equal(second[0]?.intro, null);
  assert.match(spouseTravelIntroText({ firstName: "Hugo", dossier: "Tel Aviv" }), /Hugo/);
  assert.equal(travelTextForSpouse("Ouvrir\nhttps://travelba.fr/e/c/ABCD").includes("/e/"), false);
});

test("deux conjoints au même numéro : un seul message", async () => {
  const selected = audience({
    travelers: [traveler(), traveler({ id: "twin", companionId: "twin" })],
    companions: [spouse(), spouse({ id: "twin", firstName: "Anne" })],
  });
  assert.equal(selected.recipients.filter((row) => row.role === "spouse").length, 1);
  const calls: { phone: string; intro: boolean }[] = [];
  const marked: string[] = [];
  const admin = {
    from() {
      return {
        update() {
          return {
            eq(column: string, value: string) {
              if (column === "id") marked.push(value);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  const plan = planSpouseTravelDeliveries({
    kind: "restaurant",
    visible: true,
    body: "Votre table est confirmée.",
    dossier: "Nice",
    audience: selected,
  });
  const result = await runSpouseDeliveries(admin as never, plan, "Nice", async (message) => {
    calls.push({ phone: message.phone, intro: message.intro });
    return { ok: true };
  });
  assert.deepEqual(result.sent, ["+33611223344"]);
  assert.deepEqual(result.intros, ["+33611223344"]);
  assert.equal(calls.filter((row) => row.intro).length, 1);
  assert.equal(calls.filter((row) => !row.intro).length, 1);
  assert.deepEqual(marked, ["spouse"]);
});

test("le Stop du conjoint ne coupe pas le titulaire, et l’historique se sépare par numéro", () => {
  const stopped = audience({ companions: [spouse({ optOutAt: "2026-04-01T00:00:00Z" })] });
  assert.equal(stopped.recipients.some((row) => row.role === "holder" && !holder.optOutAt), true);
  assert.equal(stopped.recipients.some((row) => row.phone === "+33611223344"), false);
  const safe = companionSafeText("Votre encours est de 120 €.\nhttps://travelba.fr/mon-compte/transactions\nVotre vol part demain.");
  assert.equal(/encours|mon-compte|120/.test(safe), false);
  assert.match(safe, /vol part demain/);
});

test("la case refuse un non-conjoint et un téléphone absent", () => {
  assert.match(spouseTravelToggleRefusal({ found: true, relationship: "enfant", phone: "+33611223344", columnReady: true }) || "", /conjoint/);
  assert.match(spouseTravelToggleRefusal({ found: true, relationship: "épouse", phone: "", columnReady: true }) || "", /téléphone/);
  assert.equal(spouseTravelToggleRefusal({ found: true, relationship: "mari", phone: "+33611223344", columnReady: true }), null);
});

test("les envois d’argent n’appellent pas l’éventail, les envois voyage oui", () => {
  const root = new URL(".", import.meta.url);
  const read = (name: string) => readFileSync(new URL(name, root), "utf8");
  for (const name of ["statement-dispatch.ts", "statement-send.ts", "hotel-option-whatsapp.ts", "whatsapp.ts"]) {
    assert.equal(read(name).includes("copyTravelNoticeToSpouses"), false, name);
  }
  for (const name of ["concierge-send.ts", "authorization-send.ts", "flight-watch-run.ts", "boarding-pass-send.ts", "restaurants-run.ts"]) {
    assert.equal(read(name).includes("copyTravelNoticeToSpouses"), true, name);
  }
  assert.equal(read("concierge-touchpoint-run.ts").includes("loadTravelWhatsappAudience"), true);
  assert.equal(read("mcp-messages.ts").includes("ensureSpouseTravelIntro"), true);
  assert.match(read("esta-run.ts"), /sendAuthorizationWhatsapp/);
  assert.match(read("uk-eta-run.ts"), /sendAuthorizationWhatsapp/);
  assert.equal(read("esta-run.ts").includes("ESTA_AUTO_WHATSAPP"), false);
  assert.equal(read("authorization-client-message.ts").includes('ESTA_AUTO_WHATSAPP = "1"'), false);
  assert.equal(read("authorization-client-message.ts").includes("ESTA_AUTO_WHATSAPP=true"), false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  attachDateDistance,
  attachSearchMatches,
  attachSearchScore,
  attachSearchTokens,
  attachTargetCaption,
  shapeAttachTargets,
  type AttachBookingRow,
  type AttachSearchDoc,
} from "./attach-search";
import { findAttachBookingIds } from "./attach-search-db";
import type { SupabaseClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function doc(partial: Partial<AttachSearchDoc>): AttachSearchDoc {
  return {
    reference: "TB-2026-0042",
    title: "",
    destination: "",
    clientName: "",
    companies: [],
    travelers: [],
    places: [],
    ...partial,
  };
}

function booking(partial: Partial<AttachBookingRow> & Pick<AttachBookingRow, "id" | "reference">): AttachBookingRow {
  return {
    title: null,
    destination: null,
    customer_id: null,
    billing_company_id: null,
    start_date: null,
    end_date: null,
    status: "confirmed",
    ...partial,
  };
}

describe("recherche de pointage", () => {
  it("ignore la casse, les accents et l’ordre des mots", () => {
    assert.deepEqual(attachSearchTokens("  Gaëlle  "), ["gaelle"]);
    assert.equal(attachSearchMatches("Séjour de Gaëlle Martin", "gaelle"), true);
    assert.equal(attachSearchMatches("Amin Khiari · Bel Air · Miami", "khiari bel air"), true);
    assert.equal(attachSearchMatches("Amin Khiari · Bel Air · Miami", "bel khiari"), true);
    assert.equal(attachSearchMatches("Amin à Miami", "amin miami"), true);
    assert.equal(attachSearchMatches("Amin à Miami", "miami amin"), true);
    assert.equal(attachSearchMatches("Gaëlle", "zoe"), false);
    assert.equal(attachSearchMatches("TB-2026-0042", "0042"), true);
    assert.equal(attachSearchMatches("n’importe", "a"), false);
  });

  it("classe la référence avant un homonyme, puis le séjour le plus proche", () => {
    const reference = doc({ reference: "TB-2026-0042", clientName: "Zoé Bernard", destination: "Rome" });
    const homonym = doc({ reference: "TB-2026-0100", title: "Hôtel 0042", clientName: "Amin", destination: "Miami" });
    assert.ok(attachSearchScore(reference, "0042") > attachSearchScore(homonym, "0042"));
    assert.equal(attachDateDistance("2026-11-01", "2026-11-08", "2026-11-02"), 0);
    assert.equal(attachDateDistance("2026-12-01", "2026-12-08", "2026-11-02"), 29);

    const rows = shapeAttachTargets({
      query: "khiari",
      today: "2026-11-02",
      bookings: [
        booking({
          id: "far",
          reference: "TB-2026-0001",
          customer_id: "c-far",
          start_date: "2027-06-01",
          end_date: "2027-06-08",
        }),
        booking({
          id: "near",
          reference: "TB-2026-0002",
          customer_id: "c-near",
          start_date: "2026-11-10",
          end_date: "2026-11-12",
        }),
      ],
      customers: [
        { id: "c-far", first_name: "Gaëlle", last_name: "Khiari", company_name: null },
        { id: "c-near", first_name: "Amin", last_name: "Khiari", company_name: null },
      ],
      companies: [],
      travelers: [],
      items: [],
    });
    assert.deepEqual(
      rows.map((row) => row.id),
      ["near", "far"]
    );
    assert.equal(rows[0]?.client, "Amin Khiari");
    assert.match(rows[0]?.dates || "", /10/);
  });

  it("retrouve le prénom, la société facturée et le voyageur, et le dit dans le libellé", () => {
    const rows = shapeAttachTargets({
      query: "gaelle nilos",
      today: "2026-11-02",
      bookings: [
        booking({
          id: "stay",
          reference: "TB-2026-0088",
          title: "Miami",
          destination: "Miami",
          customer_id: "c1",
          billing_company_id: "co-billed",
          start_date: "2026-11-04",
          end_date: "2026-11-09",
        }),
        booking({
          id: "other",
          reference: "TB-2026-0003",
          title: "Rome",
          customer_id: "c2",
          start_date: "2026-11-04",
          end_date: "2026-11-09",
        }),
      ],
      customers: [
        { id: "c1", first_name: "Amin", last_name: "Martin", company_name: "Atelier", usage_name: null },
        { id: "c2", first_name: "Paul", last_name: "Bernard", company_name: "Autre", usage_name: null },
      ],
      companies: [
        { id: "co-billed", customer_id: "c1", company_name: "NILOS FRANCE" },
        { id: "co-other", customer_id: "c1", company_name: "Atelier" },
      ],
      travelers: [{ booking_id: "stay", first_name: "Gaëlle", last_name: "Bernard" }],
      items: [
        {
          id: "h1",
          booking_id: "stay",
          kind: "hotel",
          title: "Chambre",
          amount: 100,
          details: { hotel_name: "Bel Air" },
          lifecycle: "active",
        },
        {
          id: "old",
          booking_id: "stay",
          kind: "hotel",
          title: "Annulé",
          amount: 1,
          details: null,
          lifecycle: "cancelled",
        },
      ],
    });
    assert.equal(rows[0]?.id, "stay");
    assert.equal(rows[0]?.company, "NILOS FRANCE");
    assert.equal(rows[0]?.client, "Amin Martin");
    assert.deepEqual(
      rows[0]?.items.map((item) => item.label),
      ["Bel Air"]
    );
    const caption = attachTargetCaption(rows[0] || {});
    assert.match(caption.headline, /TB-2026-0088/);
    assert.match(caption.headline, /Miami/);
    assert.match(caption.headline, /Amin Martin/);
    assert.match(caption.headline, /NILOS FRANCE/);
    assert.equal(caption.headline.includes("Miami · Miami"), false);
    assert.match(caption.detail, /Amin Martin/);
    assert.match(caption.detail, /NILOS FRANCE/);
    assert.match(caption.detail, /2026/);
    assert.equal(attachSearchScore(doc({ travelers: ["Gaëlle Bernard"] }), "gaelle") > 0, true);
    assert.equal(
      attachSearchScore(doc({ clientName: "Amin", destination: "Miami" }), "amin miami") >
        attachSearchScore(doc({ destination: "Miami" }), "amin miami"),
      true
    );
  });

  it("la société rattachée au client compte, même si la fiche n’a que le nom", () => {
    const rows = shapeAttachTargets({
      query: "bel air",
      today: "2026-11-02",
      bookings: [
        booking({
          id: "co",
          reference: "TB-2026-0010",
          customer_id: "c1",
          start_date: "2026-11-02",
          end_date: "2026-11-04",
        }),
      ],
      customers: [{ id: "c1", first_name: "Léa", last_name: "Dupont", company_name: null }],
      companies: [{ id: "co1", customer_id: "c1", company_name: "Bel Air SAS" }],
      travelers: [],
      items: [],
    });
    assert.equal(rows[0]?.company, "Bel Air SAS");
    assert.ok(attachSearchScore(doc({ companies: ["Bel Air SAS"] }), "bel air") > 0);
  });

  it("sans mot, les séjours les plus proches passent devant", () => {
    const rows = shapeAttachTargets({
      query: "",
      today: "2026-11-02",
      bookings: [
        booking({ id: "later", reference: "TB-2026-0009", start_date: "2027-01-01", end_date: "2027-01-05" }),
        booking({ id: "now", reference: "TB-2026-0008", start_date: "2026-11-01", end_date: "2026-11-06" }),
        booking({ id: "gone", reference: "TB-2026-0001", status: "cancelled", start_date: "2026-11-02", end_date: "2026-11-03" }),
      ],
      customers: [],
      companies: [],
      travelers: [],
      items: [],
    });
    assert.deepEqual(
      rows.map((row) => row.id),
      ["now", "later"]
    );
  });

  it("l’écran et Pliant n’importent pas le chargeur serveur", () => {
    for (const file of ["components/admin/OutgoingAttach.tsx", "components/admin/PliantMatchActions.tsx"]) {
      const src = readFileSync(join(root, file), "utf8");
      assert.equal(src.includes("attach-search-db"), false, file);
      assert.equal(src.includes("server-only"), false, file);
      assert.equal(src.includes("node:async_hooks"), false, file);
      assert.match(src, /AttachTargetList/, file);
    }
    const sql = readFileSync(join(root, "supabase/migrations/20261102143000_attach_booking_search.sql"), "utf8");
    for (const needle of ["first_name", "last_name", "usage_name", "company_name", "billing_company_id", "crm_booking_travelers", "fold_letters"]) {
      assert.match(sql, new RegExp(needle));
    }
  });

  it("une fonction absente laisse l’ancienne recherche, une liste d’ids est conservée", async () => {
    const missing = {
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find crm_attach_booking_search" } }),
    };
    assert.equal(await findAttachBookingIds(missing as unknown as SupabaseClient, "khiari"), null);
    const found = {
      rpc: async (name: string, args: { q: string }) => {
        assert.equal(name, "crm_attach_booking_search");
        assert.equal(args.q, "amin miami");
        return { data: [{ id: "b1" }, { id: "b1" }], error: null };
      },
    };
    assert.deepEqual(await findAttachBookingIds(found as unknown as SupabaseClient, "amin miami"), ["b1"]);
    const short = {
      rpc: async () => {
        throw new Error("ne doit pas partir");
      },
    };
    assert.deepEqual(await findAttachBookingIds(short as unknown as SupabaseClient, "a"), []);
  });
});

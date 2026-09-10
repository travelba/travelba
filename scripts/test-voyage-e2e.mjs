/**
 * End-to-end dry-run: fake client → publish mTrip → WhatsApp deep link.
 * Usage: npx tsx scripts/test-voyage-e2e.mjs
 */
import dns from "node:dns";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* ignore */
}

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { publishGuideToMtrip } = await import("../lib/mtrip/publish-guide.ts");
const { buildClientTripMessage, buildWhatsAppDeepLink } = await import(
  "../lib/agency/whatsapp.ts"
);

const phone = "0772158257";
const passengerId = crypto.randomUUID();
const guideId = crypto.randomUUID();
const email = `camille.dupont.${Date.now()}@travelba.fr`;

const fakeGuide = {
  id: guideId,
  user_id: "test",
  dossier_id: null,
  client_id: null,
  title: "Voyage Test Capri",
  status: "ready",
  mtrip_identifier: null,
  mtrip_trip_id: null,
  mtrip_account_id: Number(process.env.MTRIP_ACCOUNT_ID || 66582),
  start_date: "2026-10-12",
  end_date: "2026-10-19",
  passengers: [
    {
      id: passengerId,
      first_name: "Camille",
      last_name: "Dupont",
      middle_names: null,
      email,
      phone,
      role: "lead_traveler",
      language: "fr",
      passport_number: "12AB34567",
      nationality: "FRA",
      issuing_country: "FRA",
      birth_date: "1990-05-15",
      birth_place: "Paris",
      passport_expiry: "2032-01-01",
      sex: "F",
      import_status: "complete",
    },
  ],
  documents: [],
  quote_lines: [
    {
      id: crypto.randomUUID(),
      kind: "hotel",
      title: "Hotel Capri Palace",
      confirmation: "TEST123",
      start_date: "2026-10-12",
      end_date: "2026-10-19",
      amount: 4200,
      currency: "EUR",
    },
  ],
  extraction: {
    hotels: [
      {
        name: "Hotel Capri Palace",
        booking_reference: "TEST123",
        check_in: "2026-10-12",
        check_out: "2026-10-19",
      },
    ],
    flights: [],
    notes: [],
  },
  payload: null,
  app_links: {},
  last_error: null,
  published_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

console.log("=== 1. Publish mTrip ===");
try {
  const result = await publishGuideToMtrip(fakeGuide);
  console.log("OK identifier:", result.identifier);
  console.log("app_links:", result.app_links);
  console.log("passwords:", result.travelers);

  const { checkTripIdentifier, getMobileAppLink } = await import(
    "../lib/mtrip/client.ts"
  );
  try {
    console.log("post-check", await checkTripIdentifier(result.identifier));
  } catch (e) {
    console.log("post-check FAIL", e?.status, e?.body || e?.message);
  }
  try {
    console.log(
      "post-link",
      await getMobileAppLink({
        user_identifier: result.travelers[0].identifier,
        trip_identifier: result.identifier,
      })
    );
  } catch (e) {
    console.log("post-link FAIL", e?.status, e?.body || e?.message);
  }

  const appLink =
    result.app_links[passengerId] || Object.values(result.app_links)[0] || null;
  const pwd = result.travelers[0]?.password;
  const loginEmail = result.travelers[0]?.email || email;

  const message = buildClientTripMessage({
    firstName: "Camille",
    destination: "Voyage Test Capri",
    startDate: "2026-10-12",
    endDate: "2026-10-19",
    appLink,
    email: loginEmail,
    password: pwd,
    quoteUrl: null,
  });
  const wa = buildWhatsAppDeepLink(phone, message);
  console.log("\n=== 2. WhatsApp deep link ===");
  console.log(wa);
  console.log("\n=== Message ===\n");
  console.log(message);
} catch (err) {
  console.error("FAIL:", err?.message || err);
  if (err?.body) console.error("body:", JSON.stringify(err.body, null, 2));
  if (err?.status) console.error("status:", err.status);
  if (err?.cause) console.error("cause:", err.cause);
  process.exit(1);
}

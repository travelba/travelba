import assert from "node:assert/strict";
import test from "node:test";
import { leRoomPartyOk, toClientHotel } from "./hotel-search";
import { offersFromLeAvailability } from "./little-emperors-availability";
import { priceStayOffer } from "./hotel-search";
import {
  adoptLeBooking,
  claimLeBooking,
  deadlineStillOpen,
  instantInParis,
  clientPaymentTerms,
  leBookingRequest,
  leBookingRequestWithoutCard,
  leCardBrand,
  leCardWidgetUrl,
  leCreditCard,
  leWidgetSignal,
  safeCardWidgetUrl,
  leDeadlineParisLabel,
  cancellationFee,
  clientCancellationSentence,
  clientDeadlineInstant,
  leClientRefusal,
  lePrimaryGuest,
  leRefusalReason,
  leSessionExpired,
  PARTY_MISMATCH,
  partyChanged,
  partyWithCompanions,
  redactCardText,
} from "./le-self-book";

test("plusieurs chambres identiques, une seule dès qu’un enfant est là", () => {
  assert.equal(leRoomPartyOk([{ adults: 2, children: [] }, { adults: 2, children: [] }]).ok, true);
  const child = leRoomPartyOk([
    { adults: 2, children: [{ age: 4 }] },
    { adults: 2, children: [{ age: 4 }] },
  ]);
  assert.equal(child.ok, false);
  if (!child.ok) assert.match(child.message, /une seule chambre/i);
  const mixed = leRoomPartyOk([
    { adults: 2, children: [] },
    { adults: 1, children: [] },
  ]);
  assert.equal(mixed.ok, false);
  if (!mixed.ok) assert.match(mixed.message, /même composition/);
});

test("la carte d’agence part dans le corps, et le journal n’a ni numéro ni cryptogramme", () => {
  const card = leCreditCard({
    pan: "4242424242424242",
    cvc: "123",
    expMonth: 12,
    expYear: 2030,
    name: "Andrea Martin",
    requiresCvc: true,
  });
  assert.equal(leCardBrand("4242424242424242"), "VISA");
  assert.ok(card);
  const body = leBookingRequest({
    start: "2026-11-06",
    end: "2026-11-08",
    sessionId: "SESS",
    rateIndex: "RATE",
    hotelId: 15,
    guestName: "Camille Martin",
    guestEmail: "camille@example.com",
    eta: "18",
    rooms: [{ guestName: "Camille Martin", adults: 2, children: [] }],
    card,
  });
  assert.equal(body.rooms[0].send_email_to_guest, false);
  assert.equal((body.credit_card as { number?: string; cvc?: string }).number, "4242424242424242");
  assert.equal((body.credit_card as { cvc?: string }).cvc, "123");
  const logged = JSON.stringify(leBookingRequestWithoutCard(body));
  assert.doesNotMatch(logged, /4242|123/);
  assert.equal(redactCardText("refused 4242424242424242 cvc 123"), "refused •••• cvc •••");
  const withoutFlag = leCreditCard({
    pan: "4242424242424242",
    cvc: "123",
    expMonth: 12,
    expYear: 2030,
    name: "Andrea Martin",
    requiresCvc: false,
  });
  assert.equal(withoutFlag?.cvc, "123");
  assert.equal(
    leCreditCard({ pan: "4242424242424242", cvc: "1234", expMonth: 12, expYear: 2030, name: "Andrea Martin", requiresCvc: false }),
    null
  );
  const amex = leCreditCard({
    pan: "378282246310005",
    cvc: "1234",
    expMonth: 12,
    expYear: 2030,
    name: "Andrea Martin",
    requiresCvc: null,
  });
  assert.equal(amex?.cvc, "1234");
  assert.equal(
    leCreditCard({ pan: "378282246310005", cvc: "123", expMonth: 12, expYear: 2030, name: "Andrea Martin", requiresCvc: false }),
    null
  );
});

test("une session expirée se reconnaît, un second passage ne repose pas la réservation", () => {
  assert.equal(leSessionExpired("The session id has expired"), true);
  assert.equal(leSessionExpired("Hotel not available"), false);
  assert.deepEqual(
    claimLeBooking({ existing: { phase: "placing", leBookingId: 88, placingAtMs: 0 }, nowMs: 10_000, otherFresh: false }),
    { action: "resume" }
  );
  assert.equal(
    claimLeBooking({ existing: { phase: "placing", leBookingId: null, placingAtMs: 9_000 }, nowMs: 10_000, otherFresh: false }).action,
    "wait"
  );
  assert.equal(
    claimLeBooking({ existing: null, nowMs: 10_000, otherFresh: true }).action,
    "wait"
  );
  assert.deepEqual(
    adoptLeBooking(
      [
        {
          id: 88,
          hotel_id: 15,
          check_in: "2026-11-06",
          check_out: "2026-11-08",
          guest_names: ["Camille Martin"],
          confirmation_number: "HTL1",
          state: "confirmed",
        },
      ],
      { hotelId: 15, checkIn: "2026-11-06", checkOut: "2026-11-08", guest: "camille martin" }
    ),
    { id: 88, confirmation: "HTL1" }
  );
});

test("la limite s’affiche à l’heure de Paris et ferme le geste après cet instant", () => {
  const summer = instantInParis("2026-07-01T16:00:00");
  assert.equal(summer?.toISOString(), "2026-07-01T14:00:00.000Z");
  assert.match(leDeadlineParisLabel("2026-07-01T16:00:00") || "", /16:00/);
  assert.match(leDeadlineParisLabel("2026-07-01T14:00:00Z") || "", /16:00/);
  assert.equal(deadlineStillOpen("2026-11-01", "2026-10-23"), true);
  assert.equal(deadlineStillOpen("2026-10-01", "2026-10-23"), false);
  assert.equal(deadlineStillOpen("2026-07-01T16:00:00", "2026-07-01T13:59:00.000Z"), true);
  assert.equal(deadlineStillOpen("2026-07-01T16:00:00", "2026-07-01T14:00:00.000Z"), false);
  assert.equal(deadlineStillOpen("2026-11-05T00:00:00.000000Z", "2026-11-05T17:29:00.000Z"), true);
  assert.equal(deadlineStillOpen("2026-11-05T00:00:00.000000Z", "2026-11-06T00:30:00.000Z"), false);
});

test("le cadre de carte reste sur l’hôte du widget et les conditions ne nomment personne", () => {
  const url = leCardWidgetUrl("https://api-staging.littleemperors.com", "SESS10N");
  assert.equal(url, "https://api-staging.littleemperors.com/widgets/credit-card?session_id=SESS10N");
  assert.equal(leCardWidgetUrl("https://evil.example", "SESS10N"), null);
  assert.equal(safeCardWidgetUrl("https://api.littleemperors.com/widgets/credit-card?session_id=SESS10N"), url?.replace("api-staging", "api") || null);
  assert.equal(
    leWidgetSignal({ origin: "https://api-staging.littleemperors.com", allowedOrigin: "https://api-staging.littleemperors.com", data: { success: true } }),
    "ready"
  );
  assert.equal(
    leWidgetSignal({ origin: "https://evil.example", allowedOrigin: "https://api-staging.littleemperors.com", data: { success: true } }),
    "ignore"
  );
  const terms = clientPaymentTerms({
    paymentDescription: "No deposit required at time of booking. Little Emperors",
    requiresCvc: true,
    deadlineLabel: "18 octobre 2026 à 16:00",
    free: true,
  });
  assert.match(terms, /garantit/);
  assert.match(terms, /cryptogramme/);
  assert.match(terms, /18 octobre 2026/);
  assert.doesNotMatch(terms, /Little Emperors/);
  const bare = leBookingRequest({
    start: "2026-11-06",
    end: "2026-11-08",
    sessionId: "SESS",
    rateIndex: "RATE",
    hotelId: 15,
    guestName: "Camille Martin",
    guestEmail: "camille@example.com",
    eta: null,
    rooms: [{ guestName: "Camille Martin", adults: 2, children: [] }],
    card: null,
  });
  assert.equal("credit_card" in bare, false);
});

test("le client ne reçoit ni session, ni description de paiement", () => {
  const offers = offersFromLeAvailability(
    [
      {
        hotel_id: 15,
        hotel_name: "Ritz",
        session_id: "SESS10N",
        is_available: true,
        room_types: [
          {
            name: "Deluxe",
            rates: [
              {
                rate_index: "RATE-1",
                total_to_book: 200,
                currency_code: "EUR",
                cancellation_deadline: "2026-10-18T16:00:00",
                requires_cvc: true,
                payment_description: "Deposit required",
                can_cancel: true,
                cancellation_policy: "Free cancellation",
              },
            ],
          },
        ],
      },
    ],
    "Paris"
  );
  assert.equal(offers[0]?.sessionId, "SESS10N");
  assert.equal(offers[0]?.rateIndex, "RATE-1");
  assert.equal(offers[0]?.requiresCvc, true);
  assert.equal(offers[0]?.cancellationDeadline, "2026-10-18T16:00:00");
  const stay = priceStayOffer(offers[0]);
  assert.ok(stay);
  if (!stay) return;
  const client = JSON.stringify(toClientHotel(stay, 2, "offer"));
  assert.doesNotMatch(client, /SESS10N|Deposit required|paymentDescription|sessionId/);
  assert.equal(stay.sellCents, 20000);
});

test("un accompagnant augmente les adultes, le nom envoyé reste le principal", () => {
  const searched = [{ adults: 1, children: [{ age: 4 }] }];
  const first = partyWithCompanions(searched, [1]);
  assert.deepEqual(first, [{ adults: 2, children: [{ age: 4 }] }]);
  assert.equal(partyChanged(searched, first), true);
  const again = partyWithCompanions(first, [1]);
  assert.deepEqual(again, [{ adults: 2, children: [{ age: 4 }] }]);
  assert.equal(partyChanged(first, again), false);
  assert.deepEqual(partyWithCompanions([{ adults: 2, children: [] }], [0]), [{ adults: 2, children: [] }]);
  assert.deepEqual(partyWithCompanions([{ adults: 2, children: [] }], [2]), [{ adults: 3, children: [] }]);
  assert.equal(lePrimaryGuest("Benjamin Boukris, Victoria Boukris"), null);
  assert.equal(lePrimaryGuest("Benjamin Boukris"), "Benjamin Boukris");
  const body = leBookingRequest({
    start: "2026-11-27",
    end: "2026-11-28",
    sessionId: "SESS",
    rateIndex: "RATE",
    hotelId: 15,
    guestName: "Benjamin Boukris",
    guestEmail: "benjamin@example.com",
    eta: null,
    rooms: [{ guestName: "Benjamin Boukris", adults: 2, children: [] }],
    card: null,
  });
  assert.equal(body.guest_name, "Benjamin Boukris");
  assert.equal(body.rooms[0].guest_name, "Benjamin Boukris");
  assert.equal(body.rooms[0].adults, 2);
  assert.equal("credit_card" in body, false);
  assert.doesNotMatch(JSON.stringify(body), /Victoria/);
  const deadline = "2026-11-26T18:00:00.000000Z";
  const policy = "Free cancellation before 18:00 on 26 November 2026 after which a charge of EUR 162.74 will be incurred.";
  const instant = clientDeadlineInstant(deadline, policy);
  assert.equal(instant?.toISOString(), "2026-11-26T17:00:00.000Z");
  const sentence = clientCancellationSentence({ deadline, policy, free: true });
  assert.match(sentence, /18:00/);
  assert.doesNotMatch(sentence, /19:00|Free cancellation|Little Emperors/);
  assert.equal(cancellationFee(policy)?.amount, 162.74);
  assert.match(sentence, /162,74/);
  assert.equal(leClientRefusal(422, "guest_name: The surname must be at least 2 characters."), "Indiquez le prénom et le nom du voyageur principal, une personne par ligne.");
  assert.equal(leClientRefusal(422, "adults: The adults count does not match the rate."), PARTY_MISMATCH);
  const refused = "The given data was invalid. · credit_card.cvc: The credit card.cvc field is required when credit card is present.";
  assert.equal(leRefusalReason(422, `${refused} 4242424242424242 cvc: 123`), `${refused} •••• cvc •••`);
  assert.equal(leRefusalReason(500, refused), null);
  assert.equal(leRefusalReason(422, "   "), null);
  const logged = redactCardText("refused 4242424242424242 cvc 123 key sk_live_secret");
  assert.doesNotMatch(logged, /4242|123/);
});

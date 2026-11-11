import { BoardingPassActions } from "@/components/account/BoardingPassActions";
import { BoardingPassGroups } from "@/components/account/BoardingPassGroups";
import { ReservationFiles } from "@/components/crm/ReservationFiles";
import type { BoardingSegment } from "@/lib/crm/boarding-pass-groups";
import type { ClientBoardingCard } from "@/lib/crm/client-boarding-pass";
import { groupedBoardingPasses, type FilePreviewModel } from "@/lib/crm/preview-files";

export const dynamic = "force-dynamic";

const TRAVELERS = [
  { firstName: "Camille", lastName: "Morel" },
  { firstName: "Inès", lastName: "Morel" },
  { firstName: "Louis", lastName: "Morel" },
  { firstName: "Jade", lastName: "Morel" },
];

function dayStamp(offset: number, time: string) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.toISOString().slice(0, 10)}T${time}`;
}

function segment(
  partial: Pick<BoardingSegment, "id" | "from" | "to" | "number" | "startAt" | "endAt"> &
    Partial<Pick<BoardingSegment, "airline">>
): BoardingSegment {
  return { airline: partial.airline || "Air France", watchStatus: null, ...partial };
}

function pass(
  partial: Pick<ClientBoardingCard, "key" | "firstName" | "itemId" | "seat"> &
    Partial<Pick<ClientBoardingCard, "walletHref" | "lastName">>
): ClientBoardingCard {
  return {
    documentId: "exemple",
    page: 1,
    flight: "",
    route: "",
    when: "",
    terminal: "",
    gate: "",
    href: "about:blank",
    lastName: "Morel",
    ...partial,
  };
}

function party(itemId: string, seats: string[], wallet = false) {
  const order = ["Jade", "Louis", "Inès", "Camille"];
  return order.map((firstName, index) =>
    pass({
      key: `${itemId}-${firstName}`,
      firstName,
      itemId,
      seat: seats[order.length - 1 - index] || "",
      walletHref: wallet && (firstName === "Camille" || firstName === "Inès") ? "#apple-wallet" : null,
    })
  );
}

const confirmation: FilePreviewModel = {
  id: "confirmation-hotel",
  path: "bookings/exemple/confirmation.pdf",
  fileName: "confirmation.pdf",
  mimeType: "application/pdf",
  label: "Confirmation · Maison Horizon",
  shareText: "Bonjour, je vous transmets une pièce du dossier.",
};

export default function ExampleBoardingGroupsPage() {
  const roundTrip = groupedBoardingPasses({
    segments: [
      segment({
        id: "passe",
        from: "CDG",
        to: "LYS",
        number: "AF 1001",
        startAt: dayStamp(-8, "07:10:00"),
        endAt: dayStamp(-8, "08:05:00"),
      }),
      segment({
        id: "aller",
        from: "CDG",
        to: "NCE",
        number: "AF 1204",
        startAt: dayStamp(7, "09:20:00"),
        endAt: dayStamp(7, "10:40:00"),
      }),
      segment({
        id: "retour",
        from: "NCE",
        to: "CDG",
        number: "AF 1205",
        startAt: dayStamp(11, "18:40:00"),
        endAt: dayStamp(11, "20:05:00"),
      }),
    ],
    cards: [
      ...party("passe", ["4A", "4B", "4C", "4D"]),
      ...party("aller", ["21B", "21D", "21A", "21C"], true),
      ...party("retour", ["12A", "12C", "12B", "12D"], true),
    ],
    full: [
      { documentId: "complet-aller", href: "about:blank#aller", label: "PDF complet", itemIds: ["aller"] },
      { documentId: "complet-retour", href: "about:blank#retour", label: "PDF complet", itemIds: ["retour"] },
    ],
    travelers: TRAVELERS,
    reference: "TB-EXEMPLE-0001",
  });
  const connection = groupedBoardingPasses({
    segments: [
      segment({
        id: "cdg-ams",
        airline: "KLM",
        from: "CDG",
        to: "AMS",
        number: "KL 1401",
        startAt: dayStamp(7, "07:15:00"),
        endAt: dayStamp(7, "08:35:00"),
      }),
      segment({
        id: "ams-jfk",
        airline: "KLM",
        from: "AMS",
        to: "JFK",
        number: "KL 641",
        startAt: dayStamp(7, "10:05:00"),
        endAt: dayStamp(7, "12:20:00"),
      }),
      segment({
        id: "jfk-cdg",
        airline: "KLM",
        from: "JFK",
        to: "CDG",
        number: "KL 642",
        startAt: dayStamp(14, "16:40:00"),
        endAt: dayStamp(15, "05:50:00"),
      }),
    ],
    cards: [
      ...party("cdg-ams", ["14A", "14B", "14C", "14D"]),
      ...party("ams-jfk", ["22A", "22B", "22C", "22D"]),
      ...party("jfk-cdg", ["31A", "31B", "31C", "31D"]),
      pass({ key: "libre-noah", firstName: "Noah", lastName: "Bernard", itemId: null, seat: "8C" }),
    ],
    full: [{ documentId: "complet-kl", href: "about:blank#kl", label: "PDF complet", itemIds: ["ams-jfk"] }],
    travelers: TRAVELERS,
    reference: "TB-EXEMPLE-0001",
  });
  const connectionOnly = {
    upcoming: connection.upcoming.filter((group) => group.id === "ams-jfk"),
    past: [],
    other: null,
  };

  return (
    <div className="space-y-8">
      <section id="aller-retour" className="space-y-3">
        <ReservationFiles
          showPassports={false}
          attachments={[confirmation]}
          leading={<BoardingPassGroups groups={roundTrip} />}
        />
      </section>
      <section id="correspondance" className="space-y-3">
        <ReservationFiles
          showPassports={false}
          attachments={[]}
          leading={<BoardingPassGroups groups={connection} />}
        />
        <BoardingPassActions variant="flight" groups={connection} foldPast />
        <div id="feuille-vol">
          <p className="mb-2 text-xs font-semibold text-muted">Feuille de la correspondance</p>
          <BoardingPassActions variant="flight" groups={connectionOnly} foldPast={false} />
        </div>
      </section>
    </div>
  );
}

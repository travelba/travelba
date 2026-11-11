import { BoardingPassStack } from "@/components/account/BoardingPassStack";
import { cardsForFlight } from "@/lib/crm/client-boarding-pass";
import { loadClientBoardingCards } from "@/lib/crm/client-boarding-pass-load";

/** Pages passager d’un vol, lues après l’itinéraire. Le PDF ne retient pas le reste du séjour. */
export async function FlightBoardingPasses({ bookingId, itemId }: { bookingId: string; itemId: string }) {
  const cards = cardsForFlight(await loadClientBoardingCards(bookingId), [itemId]);
  if (!cards.length) return null;
  return (
    <div className="border-t border-[#e5e3dc] px-3.5 py-3">
      <BoardingPassStack cards={cards} variant="flight" />
    </div>
  );
}

import { VosTables } from "@/components/account/VosTables";
import { deauvilleClientEvenings, DEAUVILLE_STAY } from "@/lib/crm/deauville-preview";
import { DeauvilleClientFrame } from "./frame";

export default function DeauvilleClientProposedPage() {
  return (
    <DeauvilleClientFrame>
      <VosTables reference={DEAUVILLE_STAY.reference} evenings={deauvilleClientEvenings("proposees")} fictional />
    </DeauvilleClientFrame>
  );
}

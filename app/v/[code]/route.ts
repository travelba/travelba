import { redirectTravelerView } from "@/lib/agency/short-links";

type Params = { params: Promise<{ code: string }> };

/** Lien court WhatsApp → Traveler View My Trip (mTrip). */
export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  return redirectTravelerView(code);
}

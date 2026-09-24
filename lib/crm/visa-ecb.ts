import "server-only";
import { ECB_SNAPSHOT, parseEcbRates, type EurFx } from "./visa-fees";

export async function euroRates(fetchImpl: typeof fetch = fetch): Promise<{ date: string; rates: EurFx; live: boolean }> {
  try {
    const res = await fetchImpl("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml");
    if (!res.ok) return { ...ECB_SNAPSHOT, live: false };
    const parsed = parseEcbRates(await res.text());
    if (!parsed) return { ...ECB_SNAPSHOT, live: false };
    return { ...parsed, live: true };
  } catch {
    return { ...ECB_SNAPSHOT, live: false };
  }
}

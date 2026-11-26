import { schemaMissesRelation } from "@/lib/crm/concierge-quality-desk";
import { SIMULATION_SOURCE, type AskResult } from "@/lib/crm/concierge-reservation-sim";

type QueryError = { message?: string; code?: string } | null;

export type SimulationWriter = {
  from(table: string): {
    upsert(
      row: Record<string, unknown> | Record<string, unknown>[],
      options?: { onConflict?: string }
    ): Promise<{ error: QueryError }>;
  };
};

/** Écrit le lot. La même clé remplace les lignes. Aucune demande client, aucun envoi. */
export async function storeReservationSimulation(
  writer: SimulationWriter,
  input: { batchKey: string; batchId: string; rows: AskResult[] }
) {
  const payload = input.rows.flatMap((row) =>
    (["router", "engine"] as const).map((mode) => {
      const side = row[mode];
      return {
        batch_id: input.batchId,
        batch_key: input.batchKey,
        source: SIMULATION_SOURCE,
        booking_reference: row.reference,
        phase: row.phase,
        kind: row.kind,
        mode,
        client_text: row.clientText.slice(0, 800),
        reply: side.reply.slice(0, 800),
        ok: side.ok,
        summary: side.summary.slice(0, 240),
        engine_kind: side.engineKind,
        model: side.model,
        input_tokens: side.inputTokens,
        output_tokens: side.outputTokens,
        latency_ms: side.latencyMs,
        calls: side.calls,
      };
    })
  );
  if (!payload.length) return { stored: 0, pending: false };
  const result = await writer.from("crm_concierge_reservation_sims").upsert(payload, {
    onConflict: "batch_key,booking_reference,kind,mode",
  });
  if (schemaMissesRelation(result.error)) return { stored: 0, pending: true };
  if (result.error) return { stored: 0, pending: false, error: "insert" };
  return { stored: payload.length, pending: false };
}

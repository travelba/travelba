import { NextResponse } from "next/server";
import { jsonError } from "./auth";
import { signedCrmUrl, uploadCrmFile } from "./files";
import {
  STATEMENT_FILENAME,
  statementObjectPath,
  statementWhatsappBody,
  statementWhatsappFailure,
  statementWhatsappSuccess,
  type StatementAudience,
} from "./statement";
import { whatsappAddress } from "./whatsapp";
import { sendWhatsappSession } from "./whatsapp-session";

export function statementPdfResponse(pdf: Uint8Array) {
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${STATEMENT_FILENAME}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function statementSendResponse(
  result: { ok: true; message: string } | { ok: false; status: number; message: string }
) {
  if (!result.ok) return jsonError(result.message, result.status);
  return NextResponse.json({ ok: true, message: result.message });
}

/**
 * Dépose le PDF (URL courte pour Twilio, jamais renvoyée au navigateur)
 * et l’envoie sur le WhatsApp du client.
 */
export async function deliverStatementWhatsapp(input: {
  customerId: string;
  phone: string | null | undefined;
  firstName: string | null | undefined;
  member: boolean;
  pdf: Uint8Array;
  audience: StatementAudience;
}): Promise<{ ok: true; message: string } | { ok: false; status: number; message: string }> {
  const to = whatsappAddress(input.phone);
  if (!to) return { ok: false, status: 400, message: statementWhatsappFailure("no_phone", input.audience) };
  const path = statementObjectPath(input.customerId);
  if (!path) {
    return { ok: false, status: 502, message: statementWhatsappFailure(undefined, input.audience) };
  }
  try {
    await uploadCrmFile(path, Buffer.from(input.pdf), "application/pdf", { upsert: true });
    const mediaUrl = await signedCrmUrl(path, 600);
    const sent = await sendWhatsappSession({
      to,
      body: statementWhatsappBody(input.firstName, input.member),
      mediaUrl,
    });
    if (!sent.ok) {
      const status = sent.detail === "not_configured" ? 503 : 502;
      return { ok: false, status, message: statementWhatsappFailure(sent.detail, input.audience) };
    }
  } catch (err) {
    console.error("[releve] envoi", err instanceof Error ? err.name : "error");
    return { ok: false, status: 502, message: statementWhatsappFailure(undefined, input.audience) };
  }
  return { ok: true, message: statementWhatsappSuccess(input.audience) };
}

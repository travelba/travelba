import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { downloadCrmFile } from "@/lib/crm/files";
import { verifyStatementToken } from "@/lib/crm/statement-link";
import { isStatementDownloadName, statementContentDisposition } from "@/lib/crm/statement-filename";
import { statementObjectPath, STATEMENT_FILENAME } from "@/lib/crm/statement";
import { STATEMENT_SAMPLE_FILE, STATEMENT_SAMPLE_NAME } from "@/lib/crm/statement-whatsapp";

export const runtime = "nodejs";

function pdfResponse(bytes: Uint8Array, filename: string) {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": statementContentDisposition(filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** PDF du relevé, joignable par WhatsApp. Le jeton expire. L’exemple n’a pas de client. */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await ctx.params;
  let filename = file;
  try {
    filename = decodeURIComponent(file).normalize("NFC");
  } catch {
    return jsonError("Document introuvable", 404);
  }
  const named = isStatementDownloadName(filename);
  if (filename !== STATEMENT_FILENAME && filename !== STATEMENT_SAMPLE_FILE && !named) {
    return jsonError("Document introuvable", 404);
  }

  if (token === "exemple" && filename === STATEMENT_SAMPLE_FILE) {
    try {
      const bytes = await readFile(path.join(process.cwd(), "public", "whatsapp", STATEMENT_SAMPLE_FILE));
      return pdfResponse(bytes, STATEMENT_SAMPLE_NAME);
    } catch {
      return jsonError("Document introuvable", 404);
    }
  }

  if (filename !== STATEMENT_FILENAME && !named) return jsonError("Document introuvable", 404);
  const verified = verifyStatementToken(token);
  if (!verified) return jsonError("Document introuvable", 404);
  const storage = statementObjectPath(verified.customerId);
  if (!storage) return jsonError("Document introuvable", 404);

  try {
    const downloaded = await downloadCrmFile(storage);
    const head = Buffer.from(downloaded.bytes.subarray(0, 5)).toString("utf8");
    const type = downloaded.contentType.toLowerCase();
    if (!type.includes("pdf") && head !== "%PDF-") return jsonError("Document introuvable", 404);
    return pdfResponse(downloaded.bytes, named ? filename : STATEMENT_FILENAME);
  } catch {
    return jsonError("Document introuvable", 404);
  }
}

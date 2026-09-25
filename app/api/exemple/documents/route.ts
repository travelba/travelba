import { NextResponse } from "next/server";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { removeExampleDocument, saveExampleDocument } from "@/lib/crm/example-store";

export const runtime = "nodejs";

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const form = await request.formData();
  const file = form.get("file");
  let bytes: Uint8Array | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  if (file instanceof File && file.size > 0) {
    bytes = new Uint8Array(await file.arrayBuffer());
    fileName = file.name || "piece-exemple";
    mimeType = file.type || "application/octet-stream";
  }
  const docType = text(form, "doc_type") || "passport";
  const document = saveExampleDocument({
    docType,
    issuingCountry: text(form, "issuing_country"),
    expiresOn: text(form, "expires_on"),
    firstName: text(form, "first_name"),
    lastName: text(form, "last_name"),
    companionId: text(form, "companion_id"),
    fileName,
    mimeType,
    bytes,
  });
  return NextResponse.json({ document, documents: [document], created_companions: 0 });
}

export async function DELETE(request: Request) {
  if (!exampleSessionEnabled()) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  removeExampleDocument(id);
  return NextResponse.json({ ok: true });
}

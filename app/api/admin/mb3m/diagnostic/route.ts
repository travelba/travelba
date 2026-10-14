import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { mb3mRealm, mb3mSoap, mb3mXmlText, mb3mXmlTexts } from "@/lib/crm/mb3m";

export const dynamic = "force-dynamic";

const NS = `xmlns="http://schemas.mb3m.fr/Partners"`;

function strip(xml: string) {
  return xml.replace(/^[\s\S]*?<s:Body>/, "").replace(/<\/s:Body>[\s\S]*$/, "");
}

/**
 * Diagnostic temporaire, **lecture seule** : les pièces du dossier MB3M (`?folder=01-0002000`),
 * leur numéro, leur titre, leur état. Rien n’est écrit. À retirer une fois la facture vérifiée.
 */
export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const folderId = (new URL(request.url).searchParams.get("folder") || "").replace(/[^0-9A-Za-z-]/g, "").slice(0, 20);
  if (!folderId) return NextResponse.json({ error: "folder manquant" }, { status: 400 });
  let xml = "";
  try {
    xml = strip(await mb3mSoap("FolderService", "IFolderService", "Get", `<FolderGetRequest ${NS}><Id>${folderId}</Id></FolderGetRequest>`));
  } catch (error) {
    return NextResponse.json({ realm: mb3mRealm(), error: error instanceof Error ? error.message : String(error) });
  }
  const invoices = (xml.match(/<Invoice>[\s\S]*?<\/Invoice>/g) || []).map((block) => {
    const head = block.split("<Lines>")[0] || block;
    return {
      number: mb3mXmlText(head, "Number"),
      title: mb3mXmlText(head, "Title"),
      creation: mb3mXmlText(head, "CreationDate"),
      printed: mb3mXmlText(head, "DatePrint") || mb3mXmlText(head, "PrintedDate"),
      balance: mb3mXmlText(head, "Balance"),
      lines: mb3mXmlTexts(block, "Label").length,
      fields: [...new Set([...head.matchAll(/<([A-Za-z]+)[ >]/g)].map((match) => match[1]))].join(" "),
    };
  });
  const creditNotes = (xml.match(/<CreditNote>[\s\S]*?<\/CreditNote>/g) || []).map((block) => ({
    number: mb3mXmlText(block, "Number"),
    title: mb3mXmlText(block, "Title"),
  }));
  console.error(`[mb3m-diag] dossier ${folderId} : ${invoices.length} facture(s), ${creditNotes.length} avoir(s)\n${xml.slice(0, 6000)}`);
  return NextResponse.json({ realm: mb3mRealm(), folder: folderId, invoices, creditNotes });
}

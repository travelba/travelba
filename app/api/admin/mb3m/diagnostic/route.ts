import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { mb3mRealm, mb3mSoap, mb3mXmlText } from "@/lib/crm/mb3m";

export const dynamic = "force-dynamic";

const NS = `xmlns="http://schemas.mb3m.fr/Partners"`;

function strip(xml: string) {
  return xml.replace(/^[\s\S]*?<s:Body>/, "").replace(/<\/s:Body>[\s\S]*$/, "");
}

function day(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Diagnostic temporaire, lecture seule, sur la base MB3M courante : agences, le dossier Travelba
 * (`?folder=01-0002000`) et une facture imprimée récente de l’agence avec ses lignes.
 * Les réponses vont dans les logs serveur. À retirer une fois le refus AddPieces compris.
 */
export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const folderId = (new URL(request.url).searchParams.get("folder") || "").replace(/[^0-9A-Za-z-]/g, "").slice(0, 20);
  const out: Record<string, string> = { realm: mb3mRealm() };
  const log = (name: string, text: string) => {
    out[name] = text.slice(0, 6000);
    console.error(`[mb3m-diag] ${name}\n${text.slice(0, 6000)}`);
  };
  const run = async (name: string, call: () => Promise<string>) => {
    try {
      const xml = strip(await call());
      log(name, xml);
      return xml;
    } catch (error) {
      log(name, `ERREUR ${error instanceof Error ? error.message : String(error)}`);
      return "";
    }
  };

  await run("agencies", () => mb3mSoap("ConfigurationService", "IConfigurationService", "GetAgencies", `<GetAgencies ${NS}/>`));
  if (folderId) {
    await run("folder", () =>
      mb3mSoap("FolderService", "IFolderService", "Get", `<FolderGetRequest ${NS}><Id>${folderId}</Id></FolderGetRequest>`)
    );
  }
  const pieces = await run("pieces", () =>
    mb3mSoap(
      "FolderService",
      "IFolderService",
      "FindAllPieces",
      `<FolderFindPiecesQuery ${NS}><CreationInterval><From>${day(-180)}T00:00:00</From><To>${day(0)}T23:59:59</To></CreationInterval><IncludeInvoices>true</IncludeInvoices><IsPrinted>true</IsPrinted><PageIndex>0</PageIndex><PageSize>2</PageSize></FolderFindPiecesQuery>`
    )
  );
  const sampleFolderUid = mb3mXmlText(pieces.split("<Folder>")[1] || "", "Uid");
  if (sampleFolderUid) {
    await run("sampleFolder", () =>
      mb3mSoap("FolderService", "IFolderService", "Get", `<FolderGetRequest ${NS}><Uid>${sampleFolderUid}</Uid></FolderGetRequest>`)
    );
  }
  return NextResponse.json(out);
}

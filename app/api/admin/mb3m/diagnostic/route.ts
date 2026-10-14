import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { mb3mRealm, mb3mSoap, mb3mXmlText, mb3mXmlTexts } from "@/lib/crm/mb3m";

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

  const params = new URL(request.url).searchParams;
  const customerUid = (params.get("customer") || "").replace(/[^0-9a-fA-F-]/g, "").slice(0, 36);
  const agencyUid = (params.get("agency") || "").replace(/[^0-9a-fA-F-]/g, "").slice(0, 36);
  if (params.get("probe") === "1" && folderId && customerUid) {
    // Bissection : la facture nue d’un euro passe (variante A). Chaque variante ajoute un seul
    // champ de la vraie facture. Un échec ne laisse rien ; un succès est annulé aussitôt.
    const base = (label: string, extra = "") =>
      `<InvoiceLine><ActivityId>22</ActivityId><Label>${label}</Label>${extra}<NetPriceTotal>1</NetPriceTotal><NetPriceUnit>1</NetPriceUnit><Quantity>1</Quantity><Type>Standard</Type></InvoiceLine>`;
    const variants: { name: string; lines: string; head?: string; tail?: string }[] = [
      { name: "G-marge", lines: `<InvoiceLine><ActivityId>22</ActivityId><Label>Sonde G</Label><MarginUnit>1</MarginUnit><NetPriceTotal>1</NetPriceTotal><NetPriceUnit>1</NetPriceUnit><Quantity>1</Quantity><Type>Standard</Type></InvoiceLine>` },
      { name: "H-marge-zero", lines: `<InvoiceLine><ActivityId>22</ActivityId><Label>Sonde H</Label><MarginUnit>0</MarginUnit><NetPriceTotal>1</NetPriceTotal><NetPriceUnit>1</NetPriceUnit><Quantity>1</Quantity><Type>Standard</Type></InvoiceLine>` },
      { name: "I-note", lines: `<InvoiceLine><ActivityId>22</ActivityId><Label>Sonde I</Label><NetPriceTotal>1</NetPriceTotal><NetPriceUnit>1</NetPriceUnit><Note>Fournisseur : sonde</Note><Quantity>1</Quantity><Type>Standard</Type></InvoiceLine>` },
      { name: "J-refcommand", lines: base("Sonde J"), head: `<RefCommand>SONDE</RefCommand>` },
      { name: "K-destination", lines: base("Sonde K"), tail: `<Destination>Sonde</Destination>` },
      { name: "L-activite-7", lines: `<InvoiceLine><ActivityId>7</ActivityId><Label>Sonde L</Label><NetPriceTotal>1</NetPriceTotal><NetPriceUnit>1</NetPriceUnit><Quantity>1</Quantity><Type>Standard</Type></InvoiceLine>` },
      { name: "M-deux-lignes", lines: base("Sonde M1") + base("Sonde M2") },
      {
        name: "N-voyageurs",
        lines: base("Sonde N"),
        tail: `<Travelers><Traveler><Traveler><Person><FirstName>Sonde</FirstName><Name>Travelba</Name></Person></Traveler></Traveler></Travelers>`,
      },
      { name: "O-label-long", lines: base("Dépense · Sonde — TB-0000-0000") },
    ];
    for (const { name, lines, head = "", tail = "" } of variants) {
      const agency = agencyUid ? `<Agency><Uid>${agencyUid}</Uid></Agency>` : "";
      const travelers = tail.startsWith("<Travelers>") ? tail : "";
      const destination = travelers ? "" : tail;
      const inner = `<FolderAddPiecesRequest ${NS} xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><FolderId>${folderId}</FolderId><Invoice>${agency}<CustomerIdentity><Uid>${customerUid}</Uid></CustomerIdentity><Title>Sonde Travelba</Title>${head}<DateEnd>2026-10-11</DateEnd><DateStart>2026-10-08</DateStart>${destination}<Lines>${lines}</Lines>${travelers}</Invoice></FolderAddPiecesRequest>`;
      let xml = "";
      try {
        xml = strip(await mb3mSoap("FolderService", "IFolderService", "AddPieces", inner));
      } catch (error) {
        log(`probe-${name}`, `FAUTE ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const code = mb3mXmlText(xml, "ResultCode");
      const number = mb3mXmlTexts(xml, "Number").filter(Boolean).at(-1) || "";
      log(`probe-${name}`, `ResultCode ${code} ${mb3mXmlText(xml, "Message")} n°${number}`);
      if (code === "1" && number) {
        await run(`probe-${name}-cancel`, () =>
          mb3mSoap(
            "FolderService",
            "IFolderService",
            "CancelInvoice",
            `<FolderCancelPieceRequest ${NS}><FolderId>${folderId}</FolderId><Number>${number}</Number></FolderCancelPieceRequest>`
          )
        );
      }
    }
    return NextResponse.json(out);
  }

  await run("agencies", () => mb3mSoap("ConfigurationService", "IConfigurationService", "GetAgencies", `<GetAgencies ${NS}/>`));
  await run("productTypes", () =>
    mb3mSoap("ConfigurationService", "IConfigurationService", "GetProductTypes", `<GetProductTypes ${NS}/>`)
  );
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

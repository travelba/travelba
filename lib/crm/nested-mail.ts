/** Déplie un e-mail .eml / message/rfc822, y compris les messages imbriqués. */

export type UnfoldedFile = { name: string; mime: string; bytes: Uint8Array };

export type UnfoldedMail = { texts: string[]; files: UnfoldedFile[] };

const MAX_DEPTH = 6;

export function isNestedMailFile(mime?: string | null, name?: string | null) {
  const type = (mime || "").toLowerCase();
  const file = (name || "").toLowerCase();
  return type.includes("message/rfc822") || file.endsWith(".eml");
}

function decodeQuotedPrintable(value: string) {
  const folded = value.replace(/=\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < folded.length; index += 1) {
    const hex = folded.slice(index + 1, index + 3);
    if (folded[index] === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(folded.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function headerMap(head: string) {
  const headers: Record<string, string> = {};
  const unfolded = head.replace(/\n[ \t]+/g, " ");
  for (const line of unfolded.split("\n")) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    headers[key] = headers[key] ? `${headers[key]} ${value}` : value;
  }
  return headers;
}

function splitMessage(raw: string) {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const index = text.search(/\n\n/);
  if (index < 0) return { headers: headerMap(text), body: "" };
  return { headers: headerMap(text.slice(0, index)), body: text.slice(index + 2) };
}

function decodeText(body: string, encoding: string) {
  const enc = encoding.toLowerCase();
  if (enc.includes("base64")) {
    const clean = body.replace(/\s/g, "");
    if (!clean) return "";
    return Buffer.from(clean, "base64").toString("utf8");
  }
  if (enc.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return body;
}

function decodeBytes(body: string, encoding: string) {
  if (encoding.toLowerCase().includes("base64")) {
    const clean = body.replace(/\s/g, "");
    return new Uint8Array(Buffer.from(clean, "base64"));
  }
  return new Uint8Array(Buffer.from(decodeText(body, encoding), "utf8"));
}

function boundaryOf(contentType: string) {
  const match = contentType.match(/boundary="?([^";]+)"?/i);
  return match?.[1]?.trim() || null;
}

function filenameOf(headers: Record<string, string>, contentType: string) {
  const fromType = contentType.match(/name="?([^";]+)"?/i)?.[1];
  const disposition = headers["content-disposition"] || "";
  const fromDisposition = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return (fromDisposition || fromType || "").trim();
}

function walk(raw: string, out: UnfoldedMail, depth: number) {
  if (!raw.trim() || depth > MAX_DEPTH) return;
  const { headers, body } = splitMessage(raw);
  const contentType = headers["content-type"] || "text/plain";
  const encoding = headers["content-transfer-encoding"] || "";
  const filename = filenameOf(headers, contentType);
  const subject = (headers.subject || "").trim();
  if (subject) out.texts.push(`Objet : ${subject}`);

  const boundary = boundaryOf(contentType);
  if (/multipart\//i.test(contentType) && boundary) {
    const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    for (const part of parts) {
      const trimmed = part.replace(/^\n/, "").replace(/\n?--\s*$/, "").trim();
      if (!trimmed || trimmed === "--") continue;
      walk(trimmed, out, depth + 1);
    }
    return;
  }

  if (isNestedMailFile(contentType, filename)) {
    walk(decodeText(body, encoding), out, depth + 1);
    return;
  }

  if (/text\/plain/i.test(contentType)) {
    const text = decodeText(body, encoding).trim();
    if (text) out.texts.push(text);
    return;
  }
  if (/text\/html/i.test(contentType)) {
    const text = htmlToText(decodeText(body, encoding));
    if (text) out.texts.push(text);
    return;
  }
  if (/application\/pdf/i.test(contentType) || filename.toLowerCase().endsWith(".pdf")) {
    const bytes = decodeBytes(body, encoding || "base64");
    if (bytes.byteLength) out.files.push({ name: filename || "piece.pdf", mime: "application/pdf", bytes });
    return;
  }
  const image = /^image\//i.test(contentType) || /\.(png|jpe?g|gif|webp|heic)$/i.test(filename);
  if (image) {
    const bytes = decodeBytes(body, encoding || "base64");
    if (!bytes.byteLength) return;
    const mime = /^image\//i.test(contentType) ? contentType.split(";")[0].trim().toLowerCase() : "image/png";
    out.files.push({ name: filename || "image.png", mime, bytes });
  }
}

export function unfoldMail(raw: string | Uint8Array): UnfoldedMail {
  const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
  const out: UnfoldedMail = { texts: [], files: [] };
  walk(text, out, 0);
  return out;
}

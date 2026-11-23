const VERSION = 1;
const IV_BYTES = 12;

function bytesOf(value: BufferSource) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

async function keyOf(raw: Uint8Array) {
  if (raw.byteLength !== 32) throw new Error("clé");
  const copy = new Uint8Array(raw);
  return crypto.subtle.importKey("raw", copy, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Fichier chiffré : version, vecteur, puis le texte AES-GCM. La clé reste dans le trousseau. */
export async function sealBytes(plain: Uint8Array, rawKey: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await keyOf(rawKey);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array(plain)));
  const out = new Uint8Array(1 + IV_BYTES + cipher.byteLength);
  out[0] = VERSION;
  out.set(iv, 1);
  out.set(cipher, 1 + IV_BYTES);
  return out;
}

export async function openBytes(sealed: Uint8Array, rawKey: Uint8Array) {
  if (sealed.byteLength < 1 + IV_BYTES + 16 || sealed[0] !== VERSION) throw new Error("fichier");
  const iv = sealed.slice(1, 1 + IV_BYTES);
  const cipher = sealed.slice(1 + IV_BYTES);
  const key = await keyOf(rawKey);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return bytesOf(plain);
}

export type IngestFile = {
  name: string;
  type: string;
  buffer: ArrayBuffer;
  size?: number;
};

export function ingestFileSize(file: IngestFile) {
  return file.size ?? file.buffer.byteLength;
}

export function sanitizeStorageName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_") || "fichier";
}

/** Upload FormData avec progression XHR (fetch ne l’expose pas). */

export type XhrUploadResult = {
  ok: boolean;
  status: number;
  // Réponse API variable (passports / documents)
  json: {
    error?: string;
    guide?: AgencyMtripGuideLike;
    passengers?: unknown;
    added?: number;
    updated?: number;
    warnings?: string[];
    results?: Array<{
      file: string;
      status: string;
      message?: string;
      passenger_name?: string;
    }>;
    [key: string]: unknown;
  };
};

type AgencyMtripGuideLike = { quote_lines?: unknown[] } & Record<string, unknown>;

export function xhrFormUpload(opts: {
  url: string;
  formData: FormData;
  /** 0–1 pendant l’envoi binaire */
  onUploadProgress?: (fraction: number) => void;
}): Promise<XhrUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", opts.url);
    xhr.upload.onprogress = (e) => {
      if (!opts.onUploadProgress) return;
      if (e.lengthComputable && e.total > 0) {
        opts.onUploadProgress(Math.min(0.92, e.loaded / e.total));
      } else {
        opts.onUploadProgress(0.35);
      }
    };
    xhr.upload.onload = () => {
      // Upload terminé — serveur (OCR / analyse) en cours
      opts.onUploadProgress?.(0.93);
    };
    xhr.onload = () => {
      opts.onUploadProgress?.(1);
      let json: XhrUploadResult["json"] = {};
      try {
        json = JSON.parse(xhr.responseText || "{}") as XhrUploadResult["json"];
      } catch {
        json = { error: xhr.responseText || `HTTP ${xhr.status}` };
      }
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json,
      });
    };
    xhr.onerror = () => reject(new Error("Erreur réseau"));
    xhr.onabort = () => reject(new Error("Upload annulé"));
    xhr.send(opts.formData);
  });
}

/**
 * Progression globale multi-fichiers.
 * `fileFraction` ∈ [0,1] pour le fichier courant (index 0-based).
 */
export function multiFileProgressPct(
  fileIndex0: number,
  fileTotal: number,
  fileFraction: number
): number {
  if (fileTotal <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, fileFraction));
  const pct = ((fileIndex0 + clamped) / fileTotal) * 100;
  return Math.min(100, Math.round(pct));
}

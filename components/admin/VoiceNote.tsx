/** Lecteur d’une note vocale. `preload="none"` : le fil ne télécharge rien avant le clic. */
export function VoiceNote({ path, text }: { path: string; text: string }) {
  const src = `/api/files?path=${encodeURIComponent(path)}`;
  return (
    <div className="mt-1 min-w-0">
      <audio controls preload="none" playsInline src={src} aria-label="Note vocale" className="block w-full max-w-full" />
      <p className="mt-2 whitespace-pre-wrap break-words">{text}</p>
    </div>
  );
}

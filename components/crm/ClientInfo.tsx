import { clientInfoBlocks } from "@/lib/crm/accueil-vip";

/** Texte libre montré au client : paragraphes et listes, dans l’ordre saisi. */
export function ClientInfo({ text }: { text: string }) {
  const blocks = clientInfoBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className="space-y-2 text-sm leading-relaxed text-[var(--admin-navy)]">
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={index} className="list-disc space-y-1.5 pl-4">
            {block.items.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="font-semibold">
            {block.text}
          </p>
        )
      )}
    </div>
  );
}

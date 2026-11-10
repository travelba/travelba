import { McpWriteError } from "@/lib/crm/mcp-write";

/** Sans confirmer, l’outil renvoie l’aperçu et n’appelle pas l’écriture. */
export function holdUnlessConfirmed(input: Record<string, unknown>, apercu: Record<string, unknown>) {
  if (input.confirmer === true) return null;
  if (input.confirmer != null && input.confirmer !== false) throw new McpWriteError("confirmer est vrai ou faux.");
  return { envoye: false, ecrit: false, apercu: true, ...apercu };
}

/** Promesse dans les deux cas, pour le registre MCP. */
export function runIfConfirmed<T>(
  input: Record<string, unknown>,
  apercu: Record<string, unknown>,
  write: () => Promise<T>
): Promise<T | { envoye: boolean; ecrit: boolean; apercu: boolean }> {
  const held = holdUnlessConfirmed(input, apercu);
  return held ? Promise.resolve(held) : write();
}

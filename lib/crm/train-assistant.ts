import { fold } from "./text";

export type TrainAssistantGesture = "aucun" | "reproposer" | "horaires" | "relance" | "agence";

export type TrainAssistantReply = {
  actif: boolean;
  texte: string;
  geste: TrainAssistantGesture;
  contrainte: string;
  raison?: string;
};

const GESTURES = new Set<TrainAssistantGesture>(["aucun", "reproposer", "horaires", "relance", "agence"]);

export function openAiKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

/** Hors cadre : l’agence reprend. Pas d’achat, pas d’accord. */
export function trainOutsideScope(text: string) {
  const folded = fold(text);
  return /\b(echange|annul|rembours|reclam|plainte)/.test(folded);
}

export function trainAssistantSystem() {
  return [
    "Tu es la conciergerie Travel BA, au téléphone avec un client, pour UNE demande de train.",
    "Tutoiement, prénom seul, phrases courtes, ton détendu. Français.",
    "Tu parles horaires, tarifs, choix et questions pratiques de CE trajet.",
    "Tu n’annonces aucun prix. Le prix n’est dit qu’après revérification, par le bouton d’accord, jamais par toi.",
    "Tu n’achètes rien. Tu ne confirmes jamais à la place du client. L’accord est le bouton Je confirme.",
    "Réponds en JSON : texte, geste, contrainte.",
    "geste vaut aucun, reproposer, horaires, relance ou agence.",
    "horaires : le client veut plus tôt ou plus tard. contrainte reprend sa phrase, sans inventer d’heure.",
    "reproposer : il veut revoir les tarifs ou les trains déjà proposés.",
    "relance : il réfléchit.",
    "agence : échange, annulation, remboursement, réclamation, ou tout sujet qui n’est pas ce train.",
    "texte : 2 phrases maximum, sans prix, sans « c’est confirmé », sans « j’achète ».",
  ].join("\n");
}

export function parseTrainAssistant(raw: string): TrainAssistantReply {
  let parsed: { texte?: unknown; geste?: unknown; contrainte?: unknown } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    parsed = {};
  }
  const geste = GESTURES.has(parsed.geste as TrainAssistantGesture) ? (parsed.geste as TrainAssistantGesture) : "aucun";
  const texte = String(parsed.texte || "").replace(/\s+/g, " ").trim().slice(0, 400);
  const contrainte = String(parsed.contrainte || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    actif: true,
    texte: texte || "Dis-moi ce que tu veux changer sur ce train.",
    geste,
    contrainte,
  };
}

export async function askTrainAssistant(input: {
  prenom: string;
  trajet: string;
  etat: string;
  message: string;
  fetchImpl?: typeof fetch;
}): Promise<TrainAssistantReply> {
  const key = openAiKey();
  if (!key) return { actif: false, texte: "", geste: "aucun", contrainte: "", raison: "clé OpenAI manquante" };
  if (trainOutsideScope(input.message)) {
    return {
      actif: true,
      texte: `${input.prenom || "toi"}, je passe ça à l’agence. Les billets ne bougent pas tout seuls.`,
      geste: "agence",
      contrainte: "",
    };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: trainAssistantSystem() },
          {
            role: "user",
            content: `Prénom : ${input.prenom || "toi"}\nTrajet : ${input.trajet}\nÉtat : ${input.etat}\nMessage : ${input.message.slice(0, 500)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { actif: true, texte: "Je n’ai pas pu lire ça. Redis-moi en deux mots.", geste: "aucun", contrainte: "" };
  }
  if (!response.ok) return { actif: true, texte: "Je n’ai pas pu lire ça. Redis-moi en deux mots.", geste: "aucun", contrainte: "" };
  const payload = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  return parseTrainAssistant(payload?.choices?.[0]?.message?.content || "");
}

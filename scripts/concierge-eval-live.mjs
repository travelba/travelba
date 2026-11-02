/**
 * Appel modèle optionnel. Coupé par défaut.
 * La suite déterministe (lib/crm/concierge-eval.test.ts) bloque la CI.
 * Ne envoie ni WhatsApp ni e-mail.
 */
if (process.env.CONCIERGE_EVAL_LIVE !== "1") {
  console.log("Évaluation live coupée. Poser CONCIERGE_EVAL_LIVE=1 pour un tour avec le modèle. Rien n’est envoyé.");
  process.exit(0);
}

const { runConciergeEval } = await import("../lib/crm/concierge-eval.ts");
const { generateConciergeReply } = await import("../lib/crm/whatsapp-conversation.ts");
const results = await runConciergeEval();
const live = await generateConciergeReply({
  message: "Bonjour",
  dossier: { firstName: "Camille", stays: [], documents: [], movements: [], balances: [] },
  history: [],
  lang: "fr",
});
const failed = results.filter((result) => !result.ok);
console.log(
  JSON.stringify(
    {
      suite: failed.length ? "échec" : "ok",
      failed: failed.map((result) => result.id),
      live: live?.text ? "réponse" : "modèle indisponible",
      sent: false,
    },
    null,
    2
  )
);
process.exit(failed.length ? 1 : 0);

import { agencyEmailHtml, escapeHtml } from "@/lib/crm/email-html";
import { greetingGivenName } from "@/lib/crm/identity";
import { siteConfig } from "@/lib/site";

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const NAVY = "#0B192C";

function bodyParagraph(html: string, margin = "0") {
  return `<p style="margin:${margin};line-height:1.5;font-family:${FONT};color:${NAVY}">${html}</p>`;
}

/** Invitation à l’espace voyageur. Le lien reste valable 30 jours. */
export function inviteClientMail(input: { firstName?: string | null; link: string }) {
  const who = greetingGivenName(input.firstName);
  const hello = who ? `Bonjour ${escapeHtml(who)},` : "Bonjour,";
  return {
    subject: "Votre espace voyageur est prêt",
    html: agencyEmailHtml({
      title: "Votre espace est prêt",
      preheader: "Définissez votre mot de passe — le lien reste valable 30 jours.",
      bodyHtml: `
      ${bodyParagraph(hello, "0 0 16px")}
      ${bodyParagraph(
        `Votre espace ${escapeHtml(siteConfig.name)} est prêt. Définissez votre mot de passe pour y accéder — le lien reste valable 30&nbsp;jours.`
      )}
    `,
      ctaLabel: "Accéder à mon espace",
      ctaHref: input.link,
      footnote: "Si vous n’êtes pas à l’origine de cette invitation, ignorez cet e-mail.",
    }),
  };
}

/** Lien magique demandé depuis la page de connexion. Expire sous 24 heures. */
export function magicLinkClientMail(input: { link: string }) {
  return {
    subject: `Votre lien de connexion ${siteConfig.shortName}`,
    html: agencyEmailHtml({
      title: "Votre lien de connexion",
      preheader: "Le lien expire sous 24 heures.",
      bodyHtml: bodyParagraph("Cliquez sur le bouton pour ouvrir votre espace. Le lien expire sous 24&nbsp;heures."),
      ctaLabel: "Me connecter",
      ctaHref: input.link,
      footnote: "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
    }),
  };
}

/** Réinitialisation du mot de passe. */
export function resetPasswordClientMail(input: { link: string }) {
  return {
    subject: `Réinitialiser votre mot de passe ${siteConfig.shortName}`,
    html: agencyEmailHtml({
      title: "Choisissez un nouveau mot de passe",
      preheader: "Ce lien ouvre la page pour définir votre mot de passe.",
      bodyHtml: bodyParagraph("Cliquez sur le bouton pour choisir un nouveau mot de passe."),
      ctaLabel: "Définir mon mot de passe",
      ctaHref: input.link,
      footnote: "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
    }),
  };
}

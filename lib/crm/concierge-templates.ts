/** Définitions Utility. Elles ne sont pas soumises à Meta et ne sont pas armées. */

export type ConciergeTemplate = {
  key: string;
  category: "utility";
  status: "draft_not_submitted";
  variables: ["prenom"] | ["prenom", "reference"];
  bodies: { fr: string; en: string; he: string };
};

export const CONCIERGE_TEMPLATES: ConciergeTemplate[] = [
  {
    key: "concierge_reprise",
    category: "utility",
    status: "draft_not_submitted",
    variables: ["prenom"],
    bodies: {
      fr: "{{prenom}}, Le Concierge a bien noté votre message. L’agence vous répond.",
      en: "{{prenom}}, the Concierge has your message. The agency will reply.",
      he: "{{prenom}}, הקונסיירז' רשם את הודעתכם. הסוכנות תשיב.",
    },
  },
  {
    key: "concierge_depart",
    category: "utility",
    status: "draft_not_submitted",
    variables: ["prenom", "reference"],
    bodies: {
      fr: "{{prenom}}, votre séjour {{reference}} approche. Écrivez au Concierge si un point reste ouvert.",
      en: "{{prenom}}, your stay {{reference}} is close. Write to the Concierge if something is still open.",
      he: "{{prenom}}, השהות {{reference}} מתקרבת. כתבו לקונסיירז' אם נשאר פתוח.",
    },
  },
  {
    key: "concierge_retour",
    category: "utility",
    status: "draft_not_submitted",
    variables: ["prenom", "reference"],
    bodies: {
      fr: "{{prenom}}, merci pour {{reference}}. Un mot sur ce séjour nous aide à préparer le suivant.",
      en: "{{prenom}}, thank you for {{reference}}. A word on this stay helps us prepare the next.",
      he: "{{prenom}}, תודה על {{reference}}. מילה על השהות עוזרת להכין את הבאה.",
    },
  },
];

export function templateIsArmed(template: ConciergeTemplate) {
  return template.status !== "draft_not_submitted";
}

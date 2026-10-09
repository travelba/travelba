import { inviteClientMail, magicLinkClientMail, resetPasswordClientMail } from "@/lib/crm/client-mails";
import { ESTA_APPLY_URL, estaClientDraft, estaShouldOfferApply, type EstaAlert, type EstaStatus } from "@/lib/crm/esta";
import { estaClientMail } from "@/lib/crm/esta-mail";
import { siteConfig } from "@/lib/site";

/** Lien d’aperçu : la page de connexion, jamais un jeton réel. */
const SAMPLE_LINK = `${siteConfig.url}/connexion`;
const REFERENCE = "TB-EXEMPLE";
const VALID_UNTIL = "2027-08-29";
const PASSPORT_EXPIRES = "2026-11-02";

export type ClientMailPreview = {
  id: string;
  title: string;
  when: string;
  subject: string;
  html: string;
};

export type ClientMailGroup = {
  id: "acces" | "esta";
  title: string;
  intro: string;
  mails: ClientMailPreview[];
};

function estaPreview(input: {
  id: string;
  title: string;
  when: string;
  status: EstaStatus;
  alerts: EstaAlert[];
  validUntil?: string | null;
  passportExpires?: string | null;
}): ClientMailPreview {
  const draft = estaClientDraft({
    status: input.status,
    alerts: input.alerts,
    reference: REFERENCE,
    validUntil: input.validUntil,
    passportExpires: input.passportExpires,
  });
  if (!draft) throw new Error(`modèle ESTA absent: ${input.id}`);
  const mail = estaClientMail(draft, ESTA_APPLY_URL, [], {
    offerApply: estaShouldOfferApply(input.status, input.alerts),
  });
  return {
    id: input.id,
    title: input.title,
    when: input.when,
    subject: mail.subject,
    html: mail.html,
  };
}

/** Tous les e-mails que le client reçoit, avec l’exemple Camille / Avoriaz. */
export function clientMailCatalog(): ClientMailGroup[] {
  const invite = inviteClientMail({ firstName: "Camille", link: SAMPLE_LINK });
  const magic = magicLinkClientMail({ link: SAMPLE_LINK });
  const reset = resetPasswordClientMail({ link: SAMPLE_LINK });
  return [
    {
      id: "acces",
      title: "Accès",
      intro: "Les e-mails qui ouvrent l’espace client. Le bouton du vrai envoi porte un lien personnel. Ici, il ouvre la page de connexion.",
      mails: [
        {
          id: "invitation",
          title: "Invitation",
          when: "Quand l’agence invite le client. Le lien reste valable 30 jours.",
          subject: invite.subject,
          html: invite.html,
        },
        {
          id: "lien-magique",
          title: "Lien de connexion",
          when: "Quand le client demande un lien par e-mail depuis la page de connexion. Il expire sous 24 heures.",
          subject: magic.subject,
          html: magic.html,
        },
        {
          id: "mot-de-passe",
          title: "Nouveau mot de passe",
          when: "Quand le client demande à choisir un nouveau mot de passe.",
          subject: reset.subject,
          html: reset.html,
        },
      ],
    },
    {
      id: "esta",
      title: "ESTA",
      intro: `Le même courrier, selon ce que le contrôle a trouvé pour le séjour ${REFERENCE}. Le bouton ouvre le site officiel.`,
      mails: [
        estaPreview({
          id: "esta-manquant",
          title: "Manquant ou inachevé",
          when: "Demande absente, inachevée, introuvable ou encore en attente.",
          status: "inacheve",
          alerts: [],
        }),
        estaPreview({
          id: "esta-valable",
          title: "Valable",
          when: "ESTA approuvé qui couvre le séjour.",
          status: "approuve",
          alerts: [],
          validUntil: VALID_UNTIL,
        }),
        estaPreview({
          id: "esta-expire",
          title: "Expire avant le retour",
          when: "ESTA approuvé, mais la validité s’arrête avant la fin du séjour.",
          status: "approuve",
          alerts: ["expire_avant_retour"],
          validUntil: VALID_UNTIL,
        }),
        estaPreview({
          id: "esta-ancien",
          title: "Ancien passeport",
          when: "L’ESTA est encore lié à un passeport qui n’est plus celui du voyage.",
          status: "approuve",
          alerts: ["ancien_passeport"],
          validUntil: VALID_UNTIL,
        }),
        estaPreview({
          id: "esta-refuse",
          title: "Refusé",
          when: "La demande a été refusée. L’agence reprend contact.",
          status: "refuse",
          alerts: [],
        }),
        estaPreview({
          id: "esta-passeport-retour",
          title: "Passeport avant le retour",
          when: "L’ESTA est valable, et le passeport expire avant le vol retour.",
          status: "approuve",
          alerts: ["passeport_expire_avant_retour"],
          validUntil: VALID_UNTIL,
          passportExpires: PASSPORT_EXPIRES,
        }),
        estaPreview({
          id: "esta-passeport-esta",
          title: "Passeport avant la fin de l’ESTA",
          when: "Le passeport expire avant la fin de validité de l’ESTA.",
          status: "approuve",
          alerts: ["passeport_expire_avant_esta"],
          validUntil: VALID_UNTIL,
          passportExpires: PASSPORT_EXPIRES,
        }),
      ],
    },
  ];
}

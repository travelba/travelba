import { siteConfig } from "../site";
import {
  conciergeContentDrafts,
  conciergeContentVariables,
  conciergeTemplateImage,
  WHATSAPP_IMAGE_ALT,
  whatsappTypeImageKind,
  whatsappTypeImageUrl,
  type ConciergeTemplate,
} from "./concierge-notices";
import { flightNoticeDrafts, flightNoticeVariables, type FlightNoticeKind } from "./flight-watch";
import { tripShareMessage } from "./trip-share";
import {
  accessLinkReply,
  conciergeFollowUp,
  HANDOFF_SENTENCE,
  panRefusedReply,
  pieceSavedLine,
  planConciergeTurn,
  UNKNOWN_NUMBER_REPLY,
  type ConciergeDossier,
  type ConciergeStay,
} from "./whatsapp-concierge";
import {
  CONNEXION_BUTTON_TITLE,
  CONNEXION_TEMPLATE_NAME,
  connexionMessage,
  withConciergeSignature,
} from "./whatsapp";

const PLACE = "Avoriaz";
const REFERENCE = "TB-2026-0028";
const OTHER_REFERENCE = "TB-2026-0042";
const SUFFIX = "c/23456789";
const FIRST_NAME = "Camille";
/** Code de partage fictif de l’exemple : l’aperçu ne charge pas cette adresse. */
const SAMPLE_SHARE = "23456789";
const COVER = `${siteConfig.url}/api/covers/sejour/${REFERENCE}?partage=${SAMPLE_SHARE}`;

/** Modèles rédigés, sans chemin d’envoi. */
export type WhatsappBubble = {
  body: string;
  button: string | null;
  photo: boolean;
  image: string | null;
  imageAlt: string | null;
  modelName: string | null;
};

export type WhatsappCatalogMessage = {
  id: string;
  title: string;
  when: string;
  kind: "modele" | "session";
  wired: boolean;
  bubble: WhatsappBubble;
  /** Texte qui part si le modèle dédié n’est pas encore approuvé. */
  fallback: (WhatsappBubble & { label: string }) | null;
  /** Texte encore plus ancien, gardé si la carte sans photo n’est pas approuvée. */
  earlier: (WhatsappBubble & { label: string }) | null;
};

export type WhatsappCatalogGroup = {
  id: string;
  title: string;
  intro: string;
  messages: WhatsappCatalogMessage[];
};

type DraftSurface = {
  body: string;
  button: string | null;
  photo: boolean;
  modelName: string;
  sample: Record<string, string>;
};

function draftSurface(template: ConciergeTemplate): DraftSurface {
  const draft = conciergeContentDrafts().find((row) => row.template === template);
  if (!draft) throw new Error(`modèle absent: ${template}`);
  const types = draft.create.types as Record<
    string,
    { body?: string; media?: string[]; actions?: { title?: string }[] }
  >;
  const card = types["whatsapp/card"];
  const text = types["twilio/call-to-action"];
  const block = card || text;
  if (!block?.body) throw new Error(`corps absent: ${template}`);
  return {
    body: block.body,
    button: block.actions?.[0]?.title || null,
    photo: Boolean(card?.media?.length),
    modelName: draft.friendlyName,
    sample: draft.create.variables,
  };
}

function applyVars(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

function altFor(image: string | null) {
  if (!image) return null;
  const kind = whatsappTypeImageKind(image);
  if (kind) return WHATSAPP_IMAGE_ALT[kind];
  if (image.includes("/api/covers/sejour/")) return `Séjour à ${PLACE}`;
  return null;
}

/**
 * L’aperçu charge l’image du déploiement courant. Twilio, lui, reçoit l’URL absolue.
 * La couverture d’un dossier exige son code de partage : l’exemple montre l’illustration hôtel.
 */
function displayImage(image: string | null) {
  if (!image) return null;
  const kind = whatsappTypeImageKind(image);
  if (kind) return `/whatsapp/${kind}.jpg`;
  if (image.includes("/api/covers/sejour/")) return "/whatsapp/hotel.jpg";
  return image;
}

function bubbleFrom(template: ConciergeTemplate, variables: Record<string, string> | null): WhatsappBubble {
  const surface = draftSurface(template);
  const vars = variables || surface.sample;
  const body = applyVars(surface.body, vars);
  if (/\{\{\d+\}\}/.test(body)) throw new Error(`variable vide: ${template}`);
  const image = surface.photo
    ? Object.values(vars).find(
        (value) => value.includes("/api/covers/sejour/") || value.includes("/whatsapp/")
      ) || null
    : null;
  return {
    body,
    button: surface.button,
    photo: Boolean(image),
    image: displayImage(image),
    imageAlt: altFor(image),
    modelName: surface.modelName,
  };
}

function wiredBubble(
  template: ConciergeTemplate,
  extra?: { variable?: string | null; media?: boolean; date?: string | null }
): WhatsappBubble {
  const variables = conciergeContentVariables({
    template,
    buttonSuffix: SUFFIX,
    place: PLACE,
    reference: REFERENCE,
    mediaUrl: extra?.media === false ? null : conciergeTemplateImage(template) || COVER,
    variable: extra?.variable,
    date: extra?.date,
  });
  if (!variables) throw new Error(`envoi impossible: ${template}`);
  return bubbleFrom(template, variables);
}

function message(input: {
  id: string;
  title: string;
  when: string;
  kind?: "modele" | "session";
  wired?: boolean;
  bubble: WhatsappBubble;
  fallback?: { template: ConciergeTemplate; variable?: string | null; date?: string | null; label?: string } | null;
  earlier?: { template: ConciergeTemplate; variable?: string | null; label?: string } | null;
}): WhatsappCatalogMessage {
  const withMedia = (template: ConciergeTemplate) => template.endsWith("_photo") || template === "sejour" || template === "sejour_sans_lieu";
  const fallback = input.fallback
    ? {
        label: input.fallback.label || "Si la photo n’est pas encore approuvée",
        ...wiredBubble(input.fallback.template, {
          variable: input.fallback.variable,
          date: input.fallback.date,
          media: withMedia(input.fallback.template),
        }),
      }
    : null;
  const earlier = input.earlier
    ? {
        label: input.earlier.label || "Ancien texte, si la carte n’est pas encore approuvée",
        ...wiredBubble(input.earlier.template, {
          variable: input.earlier.variable,
          media: withMedia(input.earlier.template),
        }),
      }
    : null;
  return {
    id: input.id,
    title: input.title,
    when: input.when,
    kind: input.kind || "modele",
    wired: input.wired !== false,
    bubble: input.bubble,
    fallback,
    earlier,
  };
}

function session(id: string, title: string, when: string, body: string, image: string | null = null): WhatsappCatalogMessage {
  return message({
    id,
    title,
    when,
    kind: "session",
    bubble: {
      body,
      button: null,
      photo: Boolean(image),
      image: displayImage(image),
      imageAlt: altFor(image),
      modelName: null,
    },
  });
}

function sampleStay(reference: string, destination: string): ConciergeStay {
  return {
    id: reference,
    reference,
    title: destination,
    destination,
    startDate: "2026-12-20",
    endDate: "2026-12-27",
    totalAmount: 2400,
    currency: "EUR",
    notesClient: null,
    cover: { kind: "catalog", photoId: "photo-1674043613875-eabfa5a45425" },
    shareCode: SAMPLE_SHARE,
    items: [
      {
        kind: "flight",
        label: "Vol",
        lines: ["Départ 10h15"],
        clock: "10h15",
        included: [],
        amount: null,
      },
      {
        kind: "hotel",
        label: "Hôtel",
        lines: ["Nuit à l’hôtel"],
        clock: "",
        included: ["Petit-déjeuner"],
        amount: null,
      },
      {
        kind: "chauffeur",
        label: "Chauffeur",
        lines: ["Prise en charge à l’arrivée"],
        clock: "",
        included: [],
        amount: null,
      },
    ],
    documents: ["Confirmation d’hôtel"],
    formalities: [
      {
        country: "États-Unis",
        name: "ESTA",
        status: "piece",
        copy: "Votre autorisation est prête.",
      },
    ],
  };
}

function sampleDossier(stays: ConciergeStay[]): ConciergeDossier {
  return {
    firstName: FIRST_NAME,
    stays,
    documents: [{ label: "Passeport", holder: FIRST_NAME, expiresOn: "2030-04-12" }],
    movements: [
      {
        date: "2026-09-01",
        label: "Virement",
        direction: "credit",
        amount: 1000,
        currency: "EUR",
        stayReference: stays[0]?.reference || null,
      },
    ],
    balances: [{ currency: "EUR", balance: -1400 }],
  };
}

function reply(title: string, when: string, question: string, dossier: ConciergeDossier) {
  const turn = planConciergeTurn(question, dossier);
  const body = turn.access ? accessLinkReply("fr", `${siteConfig.url}/e/${SUFFIX}`) : turn.text;
  return session(`reponse-${title}`, title, when, body, turn.cover);
}

const FLIGHT_SAMPLES: {
  kind: FlightNoticeKind;
  title: string;
  when: string;
  clock?: string;
}[] = [
  {
    kind: "horaire",
    title: "Horaire modifié",
    when: "L’heure déposée change. Ici, le vol part à 11h20.",
    clock: "11h20",
  },
  {
    kind: "retard",
    title: "Retard",
    when: "Le vol prend du retard. Ici, le départ passe à 14h40.",
    clock: "14h40",
  },
  {
    kind: "annule",
    title: "Vol annulé",
    when: "Le vol ne part pas. L’agence est prévenue.",
  },
  {
    kind: "deroute",
    title: "Vol dérouté",
    when: "La destination du vol change. L’agence est prévenue.",
  },
  {
    kind: "enregistrement",
    title: "Enregistrement ouvert",
    when: "L’enregistrement est ouvert.",
  },
  {
    kind: "envol",
    title: "Décollage",
    when: "Le vol a décollé.",
  },
  {
    kind: "arrivee",
    title: "Arrivée",
    when: "Le vol est arrivé. Ici, bienvenue à Marrakech.",
  },
];

function flightMessages(): WhatsappCatalogMessage[] {
  return FLIGHT_SAMPLES.map((sample) => {
    const draft = flightNoticeDrafts().find((row) => row.env === `TWILIO_CONTENT_VOL_${sample.kind.toUpperCase()}`);
    if (!draft) throw new Error(`modèle de vol absent: ${sample.kind}`);
    const variables = flightNoticeVariables({
      kind: sample.kind,
      flight: "AF 1789",
      route: "CDG → RAK",
      when: sample.clock || null,
      place: sample.kind === "arrivee" ? "à Marrakech" : null,
      buttonSuffix: SUFFIX,
    });
    if (!variables) throw new Error(`exemple de vol impossible: ${sample.kind}`);
    const block = draft.create.types["twilio/call-to-action"] as {
      body?: string;
      actions?: { title?: string }[];
    };
    const body = applyVars(block.body || "", variables);
    if (/\{\{\d+\}\}/.test(body)) throw new Error(`variable vide: ${sample.kind}`);
    return message({
      id: `vol-${sample.kind}`,
      title: sample.title,
      when: sample.when,
      bubble: {
        body,
        button: block.actions?.[0]?.title || null,
        photo: false,
        image: null,
        imageAlt: null,
        modelName: draft.friendlyName,
      },
    });
  });
}

function catalogGroups(): WhatsappCatalogGroup[] {
  const one = sampleDossier([sampleStay(REFERENCE, PLACE)]);
  const two = sampleDossier([
    sampleStay(REFERENCE, PLACE),
    sampleStay(OTHER_REFERENCE, "Courchevel"),
  ]);
  const empty = sampleDossier([]);

  return [
    {
      id: "acces",
      title: "Accès à l’espace",
      intro: "Le lien est le bouton. Il reste valable 24 heures et n’est pas écrit dans le texte.",
      messages: [
        message({
          id: "connexion",
          title: "Ouvrir l’espace",
          when: "Invitation, connexion demandée par WhatsApp, ou renvoi depuis la fiche une fois le mot de passe posé. Le même texte ne repart pas deux fois dans la journée, sauf si l’agence le renvoie.",
          bubble: {
            body: connexionMessage(FIRST_NAME),
            button: CONNEXION_BUTTON_TITLE,
            photo: false,
            image: null,
            imageAlt: null,
            modelName: CONNEXION_TEMPLATE_NAME,
          },
        }),
      ],
    },
    {
      id: "sejour",
      title: "Séjour publié",
      intro: "Un seul message, au moment où le séjour devient visible. Le lieu est la ville ou la station d’arrivée.",
      messages: [
        message({
          id: "sejour-photo",
          title: "Avec la photo du lieu",
          when: "La couverture du séjour répond. La photo est celle du lieu d’arrivée.",
          bubble: wiredBubble("sejour", { media: true }),
        }),
        message({
          id: "sejour-texte",
          title: "Sans photo",
          when: "Le séjour est publié, sans couverture exploitable.",
          bubble: wiredBubble("sejour_texte", { media: false }),
        }),
      ],
    },
    {
      id: "pieces",
      title: "Pièces ajoutées au séjour",
      intro: "Les pièces déposées dans la même heure partent ensemble, une heure après la première.",
      messages: [
        message({
          id: "piece-hotel",
          title: "Confirmation d’hôtel",
          when: "Une confirmation d’hôtel vient d’être ajoutée au séjour publié. L’image est celle de l’hôtel.",
          bubble: wiredBubble("piece_hotel_photo"),
          fallback: { template: "piece_hotel" },
          earlier: { template: "piece", variable: "confirmation d'hôtel" },
        }),
        message({
          id: "piece-vol",
          title: "Billet",
          when: "Un billet d’avion vient d’être ajouté. L’image est celle du billet.",
          bubble: wiredBubble("piece_vol_photo"),
          fallback: { template: "piece_vol" },
        }),
        message({
          id: "piece-transfert",
          title: "Transfert",
          when: "Un transfert vient d’être ajouté. L’image est celle du transfert.",
          bubble: wiredBubble("piece_transfert_photo"),
          fallback: { template: "piece_transfert" },
        }),
        message({
          id: "pieces-trio",
          title: "Billet, hôtel et transfert",
          when: "Ces trois pièces arrivent dans la même heure. L’image reprend les pièces du séjour.",
          bubble: wiredBubble("pieces_regroupees_photo"),
          fallback: { template: "pieces_regroupees" },
          earlier: {
            template: "pieces_composees",
            variable: "billet, la confirmation d'hôtel et le transfert",
          },
        }),
        message({
          id: "piece-autre",
          title: "Autre pièce",
          when: "Assurance, activité, train, voiture ou pièce sans type dédié. L’image est celle du document.",
          bubble: wiredBubble("document_photo"),
          fallback: { template: "document" },
          earlier: {
            template: "piece_photo",
            variable: "pièce",
            label: "Sans carte dédiée, avec la photo du lieu",
          },
        }),
        message({
          id: "pieces-plusieurs",
          title: "Plusieurs pièces du même type",
          when: "Par exemple deux billets déposés dans la même heure. L’image reprend les pièces du séjour.",
          bubble: wiredBubble("pieces_photo", { variable: "billets" }),
          fallback: { template: "pieces", variable: "billets" },
        }),
        message({
          id: "pieces-melange",
          title: "Pièces de types différents",
          when: "Par exemple une confirmation d’hôtel et un transfert, hors trio billet + hôtel + transfert.",
          bubble: wiredBubble("pieces_composees_photo", {
            variable: "confirmation d'hôtel et le transfert",
          }),
          fallback: {
            template: "pieces_composees",
            variable: "confirmation d'hôtel et le transfert",
          },
        }),
      ],
    },
    {
      id: "depart",
      title: "Avant le départ",
      intro: "Tant que le séjour est publié et que la date de départ n’est pas passée.",
      messages: [
        message({
          id: "passeport",
          title: "Un passeport manque",
          when: "Une fois pour le séjour, si un passeport n’est pas au coffre.",
          bubble: wiredBubble("passeport_carte_photo"),
          fallback: { template: "passeport_carte" },
          earlier: { template: "passeport" },
        }),
        message({
          id: "passeports",
          title: "Plusieurs passeports manquent",
          when: "Une fois pour le séjour, si plusieurs passeports manquent.",
          bubble: wiredBubble("passeports_carte_photo"),
          fallback: { template: "passeports_carte" },
          earlier: { template: "passeports" },
        }),
        message({
          id: "formalite-manquante",
          title: "Une formalité manque",
          when: "Une fois par formalité, tant qu’elle n’est pas déposée. Ici, un visa. L’image est celle du visa.",
          bubble: wiredBubble("formalite_manquante_carte_photo", { variable: "visa" }),
          fallback: { template: "formalite_manquante_carte", variable: "visa" },
          earlier: { template: "formalite_manquante", variable: "visa" },
        }),
        message({
          id: "formalite-prete",
          title: "La formalité est prête",
          when: "La pièce est dans l’espace. Ici, un ESTA. L’image est celle du visa.",
          bubble: wiredBubble("formalite_prete_carte_photo", { variable: "ESTA" }),
          fallback: { template: "formalite_prete_carte", variable: "ESTA" },
          earlier: { template: "formalite_prete", variable: "ESTA" },
        }),
      ],
    },
    authorizationGroup(),
    {
      id: "vols",
      title: "Vol en cours",
      intro: "Ces messages partent quand le statut du vol change, si le séjour est publié et si le client a accepté WhatsApp. Ils n’ont pas d’image : le bouton ouvre le séjour. L’exemple est le vol AF 1789, CDG → RAK.",
      messages: flightMessages(),
    },
    {
      id: "partage",
      title: "Partage du voyage",
      intro: "Le compagnon reçoit le lien du voyage. Ce lien n’ouvre pas le compte.",
      messages: [
        session(
          "partage",
          "Lien envoyé à un accompagnant",
          "Depuis la fiche du séjour, vers le téléphone de l’accompagnant. Le message part dans la conversation en cours.",
          tripShareMessage({
            firstName: FIRST_NAME,
            title: PLACE,
            url: `${siteConfig.url}/v/23456789`,
          }),
          whatsappTypeImageUrl("partage")
        ),
      ],
    },
    {
      id: "reponses",
      title: "Quand le client écrit",
      intro: "Ces réponses partent dans la conversation. Les exemples reprennent un dossier fictif. Si le client écrit en anglais, la même réponse part en anglais. Une demande de changement, d’annulation, de paiement, de formalité ou de chauffeur est transmise à l’agence.",
      messages: [
        session("numero-inconnu", "Numéro inconnu", "Le téléphone n’est sur aucune fiche.", UNKNOWN_NUMBER_REPLY),
        session(
          "numero-partage",
          "Plusieurs fiches pour ce numéro",
          "Le téléphone correspond à plus d’un client. Rien n’est répondu sur un dossier.",
          withConciergeSignature(HANDOFF_SENTENCE)
        ),
        session(
          "piece-coffre",
          "Pièce reçue",
          "Le client envoie une photo ou un PDF, sans numéro de carte.",
          withConciergeSignature(pieceSavedLine("fr"))
        ),
        session(
          "carte-refusee",
          "Numéro de carte refusé",
          "La pièce contient un numéro de carte. Il n’est pas conservé.",
          panRefusedReply("fr")
        ),
        session(
          "piece-ratee",
          "Pièce non enregistrée",
          "Le fichier n’a pas pu être gardé.",
          withConciergeSignature(
            "Je n’ai pas pu enregistrer cette pièce. Vous pouvez la renvoyer, ou j’en parle à l’agence."
          )
        ),
        reply("Arrêt des messages", "Le client écrit « Stop les messages ».", "Stop les messages", one),
        reply(
          "Nouveau lien d’accès",
          "Le client demande d’ouvrir son espace dans la conversation. Le lien n’est pas son mot de passe.",
          "Ouvrez mon espace",
          one
        ),
        reply("Bonjour", "Un seul séjour publié. L’exemple invente l’heure et l’hôtel.", "Bonjour", one),
        reply(
          "Plusieurs séjours",
          "Le client salue et plusieurs séjours sont publiés.",
          "Bonjour",
          two
        ),
        reply("Encours", "Le client demande ce qu’il reste à régler.", "Quel est mon encours ?", one),
        reply("Mouvements", "Les dernières écritures du grand livre.", "Montrez-moi mes transactions", one),
        reply("Coffre", "Les pièces d’identité déjà enregistrées.", "Où est mon passeport ?", one),
        reply("Formalité", "L’état de la formalité déposée.", "Où en est mon ESTA ?", one),
        reply("Horaire", "Uniquement l’heure déjà écrite dans le dossier.", "À quelle heure est le vol ?", one),
        reply("Inclus", "Uniquement le détail déjà écrit dans le dossier.", "Le petit-déjeuner est-il inclus ?", one),
        reply("Prix", "Le montant publié du séjour.", "Quel est le prix ?", one),
        reply("Chauffeur", "Le chauffeur déjà présent dans le séjour.", "Où est le chauffeur ?", one),
        reply("Séjour", "Le carnet publié.", "Quel est mon séjour ?", one),
        reply(
          "Rien dans le dossier",
          "La question ne correspond à rien de publié.",
          "Quelle est la météo là-bas ?",
          empty
        ),
        reply(
          "Fait absent du dossier",
          "Le client demande une heure qui n’est pas écrite. Rien n’est inventé.",
          "À quelle heure est le vol ?",
          sampleDossier([
            {
              ...sampleStay(REFERENCE, PLACE),
              items: [
                {
                  kind: "flight",
                  label: "Vol",
                  lines: ["Paris — Avoriaz"],
                  clock: "",
                  included: [],
                  amount: null,
                },
              ],
            },
          ])
        ),
        reply("Conseil général", "Une question pratique, sans fait du séjour.", "Quelle prise en France ?", one),
        session(
          "transmission",
          "Demande transmise à l’agence",
          "Changement, annulation, rapprochement d’un paiement, dépôt d’une formalité ou demande de chauffeur. Le séjour reconnu est nommé.",
          conciergeFollowUp(
            `${HANDOFF_SENTENCE}\nCela concerne le séjour ${REFERENCE}.\n${siteConfig.url}/mon-compte/reservations/${REFERENCE}`
          )
        ),
        reply(
          "Plainte",
          "Le client se plaint et le dossier ne répond pas. La demande part aussi à l’agence.",
          "C’est inacceptable",
          one
        ),
      ],
    },
    {
      id: "attente",
      title: "Rédigés, pas encore envoyés",
      intro: "Ces textes existent. Aucun envoi ne les utilise pour le moment.",
      messages: [
        message({
          id: "sejour-sans-lieu-photo",
          title: "Séjour sans lieu, avec photo",
          when: "Non envoyé. Sans ville ou station d’arrivée, le séjour publié ne déclenche pas de message.",
          wired: false,
          bubble: bubbleFrom("sejour_sans_lieu", null),
        }),
        message({
          id: "sejour-sans-lieu-texte",
          title: "Séjour sans lieu, sans photo",
          when: "Non envoyé.",
          wired: false,
          bubble: bubbleFrom("sejour_sans_lieu_texte", null),
        }),
        message({
          id: "encours-modele",
          title: "Encours du séjour",
          when: "Non envoyé. L’encours part seulement si le client le demande dans la conversation.",
          wired: false,
          bubble: wiredBubble("encours_photo"),
          fallback: { template: "encours" },
        }),
        message({
          id: "chauffeur-modele",
          title: "Chauffeur du séjour",
          when: "Non envoyé. Le chauffeur est répondu dans la conversation, à la demande.",
          wired: false,
          bubble: wiredBubble("chauffeur_photo"),
          fallback: { template: "chauffeur" },
        }),
        message({
          id: "rappel-modele",
          title: "Rappel de départ",
          when: "Non envoyé.",
          wired: false,
          bubble: wiredBubble("rappel_photo"),
          fallback: { template: "rappel" },
        }),
        message({
          id: "connexion-sejour",
          title: "Connexion citant le séjour",
          when: "Non envoyé. La connexion utilise le texte « Votre espace personnel vous attend ».",
          wired: false,
          bubble: wiredBubble("connexion_carte_photo", { variable: FIRST_NAME }),
          fallback: { template: "connexion_carte", variable: FIRST_NAME },
        }),
      ],
    },
  ];
}

const AUTH_DATE = "29/08/2027";

function authorizationMessage(input: {
  id: string;
  title: string;
  when: string;
  photo: ConciergeTemplate;
  text: ConciergeTemplate;
  dated: boolean;
}): WhatsappCatalogMessage {
  return message({
    id: input.id,
    title: input.title,
    when: input.when,
    bubble: wiredBubble(input.photo, { variable: FIRST_NAME, date: input.dated ? AUTH_DATE : null }),
    fallback: { template: input.text, variable: FIRST_NAME, date: input.dated ? AUTH_DATE : null },
  });
}

function authorizationGroup(): WhatsappCatalogGroup {
  return {
    id: "esta-eta",
    title: "ESTA et ETA Royaume-Uni",
    intro:
      "Ces messages partent depuis le badge du voyageur, après un résultat, si le client a accepté WhatsApp. Un clic montre le texte puis l’envoie. Rien ne part seul. L’image est celle du visa. Sans le modèle illustré, le même texte part sans photo.",
    messages: [
      authorizationMessage({
        id: "esta-manquant",
        title: "ESTA manquant",
        when: "Aucun ESTA en cours pour ce voyageur et ce séjour : le résultat est introuvable.",
        photo: "esta_manquant_carte_photo",
        text: "esta_manquant_carte",
        dated: false,
      }),
      authorizationMessage({
        id: "esta-expire",
        title: "ESTA qui expire avant le retour",
        when: "Un ESTA existe, mais il expire avant la date de retour du séjour, ou avant le départ.",
        photo: "esta_expire_carte_photo",
        text: "esta_expire_carte",
        dated: true,
      }),
      authorizationMessage({
        id: "esta-ancien",
        title: "ESTA sur un ancien passeport",
        when: "L’ESTA est lié à un passeport qui n’est plus le passeport actuel. Une nouvelle demande est nécessaire avec le passeport en cours.",
        photo: "esta_ancien_passeport_carte_photo",
        text: "esta_ancien_passeport_carte",
        dated: false,
      }),
      authorizationMessage({
        id: "esta-approuve",
        title: "ESTA approuvé",
        when: "L’ESTA est valable pour tout le séjour. La date de fin est dans le message.",
        photo: "esta_approuve_carte_photo",
        text: "esta_approuve_carte",
        dated: true,
      }),
      authorizationMessage({
        id: "eta-manquant",
        title: "ETA Royaume-Uni manquante",
        when: "Aucune ETA en cours pour ce voyageur et ce séjour : le résultat est introuvable.",
        photo: "eta_uk_manquant_carte_photo",
        text: "eta_uk_manquant_carte",
        dated: false,
      }),
      authorizationMessage({
        id: "eta-expire",
        title: "ETA qui expire avant le retour",
        when: "Une ETA existe, mais elle expire avant la date de retour du séjour, ou avant le départ.",
        photo: "eta_uk_expire_carte_photo",
        text: "eta_uk_expire_carte",
        dated: true,
      }),
      authorizationMessage({
        id: "eta-ancien",
        title: "ETA sur un ancien passeport",
        when: "L’ETA est liée à un passeport qui n’est plus le passeport actuel. Une nouvelle demande est nécessaire avec le passeport en cours.",
        photo: "eta_uk_ancien_passeport_carte_photo",
        text: "eta_uk_ancien_passeport_carte",
        dated: false,
      }),
      authorizationMessage({
        id: "eta-approuve",
        title: "ETA Royaume-Uni approuvée",
        when: "L’ETA est valable pour tout le séjour. La date de fin est dans le message.",
        photo: "eta_uk_approuve_carte_photo",
        text: "eta_uk_approuve_carte",
        dated: true,
      }),
    ],
  };
}

let cached: WhatsappCatalogGroup[] | null = null;

export function whatsappCatalog() {
  if (!cached) cached = catalogGroups();
  return cached;
}


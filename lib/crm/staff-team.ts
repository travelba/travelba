export type StaffRole = "admin" | "agent" | "partner";

export type Colleague = {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
};

export const STAFF_COPY = {
  removeAdmin: "Un administrateur ne se retire pas. Limitez d’abord son rôle à agent.",
  removeSelf: "Vous ne pouvez pas retirer votre propre accès.",
  lastAdmin: "L’agence garde au moins un administrateur.",
  customer: "Cette adresse appartient à un client. L’agence n’en fait pas un collègue.",
  already: "Ce collègue fait déjà partie de l’équipe. Renvoyez le lien sur sa ligne.",
  email: "Indiquez une adresse e-mail valide.",
  name: "Indiquez le nom du collègue.",
  nameLong: "Le nom est trop long.",
  role: "Rôle inconnu.",
  notFound: "Collègue introuvable.",
  forbidden: "Seuls les administrateurs gèrent l’équipe.",
  prepare: "Impossible de préparer l’accès.",
  roleSave: "Le rôle n’a pas pu être enregistré.",
  changed: "Le rôle a changé. Rechargez la page.",
} as const;

export function staffRoleLabel(role: StaffRole) {
  if (role === "admin") return "Administrateur";
  if (role === "partner") return "Partenaire MyLER";
  return "Agent";
}

/**
 * Lien d’e-mail partenaire sur une preview : le jeton de partage ouvre sans mur Vercel.
 * Absent du dépôt. Ignoré pour l’agence et pour travelba.fr.
 */
export function colleagueAccessLink(link: string, role: StaffRole, shareToken: string | null | undefined) {
  if (role !== "partner") return link;
  const token = (shareToken || "").trim();
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) return link;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return link;
  }
  if (!url.hostname.endsWith(".vercel.app")) return link;
  url.searchParams.set("_vercel_share", token);
  return url.toString();
}

/** Texte de l’e-mail d’accès. Le partenaire est entièrement en anglais. */
export function colleagueAccessCopy(role: StaffRole) {
  if (role === "partner") {
    return {
      subject: "Your Little Emperors access",
      title: "Your Little Emperors access",
      preheader: "Set your password. The link stays valid for 30 days.",
      intro: "Travelba has opened the MyLER integration for you.",
      detail:
        "Set your password to open it. The link stays valid for 30 days. You only open Little Emperors. SSO POST /v1/login is not used.",
      cta: "Set your password",
    };
  }
  return {
    subject: "Votre accès à l’espace agence",
    title: "Votre accès à l’espace agence",
    preheader: "Définissez votre mot de passe — le lien reste valable 30 jours.",
    intro: "L’agence vous ouvre l’espace agence.",
    detail: "Définissez votre mot de passe pour y accéder — le lien reste valable 30 jours.",
    cta: "Ouvrir l’espace agence",
  };
}

/** Salutation et pied de l’e-mail. Le partenaire ne reçoit pas de français. */
export function colleagueEmailFrame(role: StaffRole, fullName: string) {
  const partner = role === "partner";
  const who = fullName.trim().split(/\s+/)[0] || "";
  if (partner) {
    return {
      lang: "en" as const,
      hello: who ? `Hello ${who},` : "Hello,",
      footnote: "If you were not expecting this access, you can ignore this email.",
    };
  }
  return {
    lang: "fr" as const,
    hello: who ? `Bonjour ${who},` : "Bonjour,",
    footnote: "Si vous n’attendiez pas cet accès, ignorez cet e-mail.",
  };
}

export function parseStaffRole(value: unknown): StaffRole | null {
  if (value === "admin" || value === "agent" || value === "partner") return value;
  return null;
}

/** Rôle écrit dans le JWT. Un partenaire ne devient jamais administrateur. */
export function jwtStaffRole(role: StaffRole): StaffRole {
  if (role === "partner") return "partner";
  if (role === "agent") return "agent";
  return "admin";
}

export function normalizeColleagueEmail(value: string) {
  return value.trim().toLowerCase();
}

export function colleagueEmailError(email: string): string | null {
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return STAFF_COPY.email;
  }
  return null;
}

export function colleagueNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return STAFF_COPY.name;
  if (trimmed.length > 120) return STAFF_COPY.nameLong;
  return null;
}

export function colleagueInviteBlock(input: { isCustomer: boolean; isAlreadyStaff: boolean }) {
  if (input.isCustomer) return STAFF_COPY.customer;
  if (input.isAlreadyStaff) return STAFF_COPY.already;
  return null;
}

export function removalBlockReason(input: {
  actorId: string;
  targetId: string;
  targetRole: StaffRole;
}) {
  if (input.targetRole === "admin") return STAFF_COPY.removeAdmin;
  if (input.targetId === input.actorId) return STAFF_COPY.removeSelf;
  return null;
}

/** Garder le compte voyageur s’il existe. Sinon supprimer l’accès Auth. */
export function removalAuthPlan(isCustomer: boolean): "keep-client" | "delete-user" {
  return isCustomer ? "keep-client" : "delete-user";
}

export function roleChangeBlockReason(input: {
  targetRole: StaffRole;
  nextRole: StaffRole;
  adminCount: number;
}) {
  if (input.targetRole === input.nextRole) return null;
  if (input.targetRole === "admin" && input.nextRole !== "admin" && input.adminCount <= 1) {
    return STAFF_COPY.lastAdmin;
  }
  return null;
}

export function roleActionLabel(current: StaffRole, next: StaffRole) {
  if (current === next) return null;
  if (next === "admin") return "Passer administrateur";
  if (next === "partner") return "Limiter à partenaire MyLER";
  if (current === "partner") return "Passer agent";
  return "Limiter à agent";
}

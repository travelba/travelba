export type StaffRole = "admin" | "agent";

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
  already: "Ce collègue fait déjà partie de l’équipe.",
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
  return role === "admin" ? "Administrateur" : "Agent";
}

export function parseStaffRole(value: unknown): StaffRole | null {
  if (value === "admin" || value === "agent") return value;
  return null;
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
  if (input.targetRole === "admin" && input.nextRole === "agent" && input.adminCount <= 1) {
    return STAFF_COPY.lastAdmin;
  }
  return null;
}

export function roleActionLabel(current: StaffRole, next: StaffRole) {
  if (current === next) return null;
  if (next === "agent") return "Limiter à agent";
  return "Passer administrateur";
}

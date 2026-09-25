import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { agencyEmailHtml, escapeHtml } from "@/lib/crm/email-html";
import { createEntryLink } from "@/lib/crm/entry-link";
import type { CrmStaff } from "@/lib/crm/types";
import {
  colleagueEmailError,
  colleagueInviteBlock,
  colleagueNameError,
  normalizeColleagueEmail,
  parseStaffRole,
  removalAuthPlan,
  removalBlockReason,
  roleChangeBlockReason,
  STAFF_COPY,
  type Colleague,
  type StaffRole,
} from "@/lib/crm/staff-team";

export class StaffTeamError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "StaffTeamError";
    this.status = status;
  }
}

type RosterRow = {
  id: string;
  role: StaffRole;
  auth_user_id: string;
  full_name: string;
};

function isAlreadyRegistered(message: string) {
  return /already been registered|already registered|email_exists|user already exists/i.test(message);
}

function givenName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "";
}

function colleagueEmailHtml(fullName: string, link: string) {
  const who = givenName(fullName);
  const hello = who ? `Bonjour ${escapeHtml(who)},` : "Bonjour,";
  return agencyEmailHtml({
    title: "Votre accès à l’espace agence",
    preheader: "Définissez votre mot de passe — le lien reste valable 30 jours.",
    bodyHtml: `
      <p style="margin:0 0 16px;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">${hello}</p>
      <p style="margin:0;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">
        L’agence vous ouvre l’espace agence.
        Définissez votre mot de passe pour y accéder — le lien reste valable 30&nbsp;jours.
      </p>
    `,
    ctaLabel: "Ouvrir l’espace agence",
    ctaHref: link,
    footnote: "Si vous n’attendiez pas cet accès, ignorez cet e-mail.",
  });
}

async function sendColleagueEmail(email: string, fullName: string, link: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `${siteConfig.name} <${from}>`,
    to: [email],
    replyTo: siteConfig.contactEmail,
    subject: "Votre accès à l’espace agence",
    html: colleagueEmailHtml(fullName, link),
  });
  if (error) {
    console.error("[equipe] e-mail non envoyé");
    return false;
  }
  return true;
}

async function loadRoster(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("crm_staff")
    .select("id, role, auth_user_id, full_name");
  if (error) throw new StaffTeamError("Impossible de lire l’équipe.", 500);
  return (data || []) as RosterRow[];
}

async function writeAppMetadata(
  admin: SupabaseClient,
  authUserId: string,
  appMetadata: Record<string, unknown>,
  userMetadata?: Record<string, unknown>
) {
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: appMetadata,
    ...(userMetadata ? { user_metadata: userMetadata } : {}),
  });
  if (error) throw new StaffTeamError(STAFF_COPY.roleSave, 502);
}

export async function listColleagues(): Promise<Colleague[]> {
  const admin = createServiceClient();
  const { data, error } = await admin.from("crm_staff").select("*").order("full_name");
  if (error) throw new StaffTeamError("Impossible de lire l’équipe.", 500);
  const rows = (data || []) as CrmStaff[];
  const colleagues = await Promise.all(
    rows.map(async (row) => {
      let email = "";
      try {
        const { data: userData } = await admin.auth.admin.getUserById(row.auth_user_id);
        email = userData.user?.email || "";
      } catch {
        email = "";
      }
      const role = parseStaffRole(row.role) || "agent";
      return {
        id: row.id,
        fullName: row.full_name?.trim() || "Collègue",
        email,
        role,
      } satisfies Colleague;
    })
  );
  colleagues.sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.fullName.localeCompare(b.fullName, "fr", { sensitivity: "base" });
  });
  return colleagues;
}

export async function addColleague(
  input: { fullName: string; email: string; role: StaffRole },
  origin: string
) {
  const email = normalizeColleagueEmail(input.email);
  const emailError = colleagueEmailError(email);
  if (emailError) throw new StaffTeamError(emailError);
  const fullName = input.fullName.trim();
  const nameError = colleagueNameError(fullName);
  if (nameError) throw new StaffTeamError(nameError);
  const role = parseStaffRole(input.role);
  if (!role) throw new StaffTeamError(STAFF_COPY.role);

  const admin = createServiceClient();
  const { data: customer, error: customerError } = await admin
    .from("crm_customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (customerError) throw new StaffTeamError("Impossible de vérifier cette adresse.", 500);
  const earlyBlock = colleagueInviteBlock({
    isCustomer: Boolean(customer),
    isAlreadyStaff: false,
  });
  if (earlyBlock) throw new StaffTeamError(earlyBlock, 409);

  let linkType: "invite" | "recovery" = "invite";
  let generated = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: fullName } },
  });
  if (generated.error && isAlreadyRegistered(generated.error.message)) {
    linkType = "recovery";
    generated = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
  }
  if (generated.error || !generated.data?.user || !generated.data.properties?.hashed_token) {
    throw new StaffTeamError(STAFF_COPY.prepare, 502);
  }

  const authUser = generated.data.user;
  const createdNew = linkType === "invite";
  const hashedToken = generated.data.properties.hashed_token;

  const undo = async (staffId?: string) => {
    if (staffId) await admin.from("crm_staff").delete().eq("id", staffId);
    if (createdNew) await admin.auth.admin.deleteUser(authUser.id);
  };

  const { data: customerByAuth } = await admin
    .from("crm_customers")
    .select("id")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  const { data: existingStaff } = await admin
    .from("crm_staff")
    .select("id")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  const block = colleagueInviteBlock({
    isCustomer: Boolean(customerByAuth),
    isAlreadyStaff: Boolean(existingStaff),
  });
  if (block) {
    await undo();
    throw new StaffTeamError(block, 409);
  }

  const { data: created, error: insertError } = await admin
    .from("crm_staff")
    .insert({
      auth_user_id: authUser.id,
      role,
      full_name: fullName,
    })
    .select("id, full_name, role")
    .single();
  if (insertError || !created) {
    await undo();
    throw new StaffTeamError(STAFF_COPY.prepare, 502);
  }

  const { data: fresh } = await admin.auth.admin.getUserById(authUser.id);
  const previousMeta = { ...(fresh.user?.app_metadata || authUser.app_metadata || {}) };
  const previousUserMeta = { ...(fresh.user?.user_metadata || authUser.user_metadata || {}) };
  try {
    await writeAppMetadata(
      admin,
      authUser.id,
      { ...previousMeta, must_set_password: true, crm_role: role },
      { ...previousUserMeta, full_name: fullName }
    );
  } catch (err) {
    await undo(created.id);
    throw err;
  }

  let link = "";
  try {
    link = await createEntryLink(admin, origin, {
      tokenHash: hashedToken,
      otpType: linkType,
      nextPath: "/admin",
    });
  } catch (err) {
    await writeAppMetadata(admin, authUser.id, previousMeta, previousUserMeta);
    await undo(created.id);
    throw err instanceof StaffTeamError ? err : new StaffTeamError(STAFF_COPY.prepare, 502);
  }

  const delivered = await sendColleagueEmail(email, fullName, link);
  return {
    delivered,
    link,
    colleague: {
      id: created.id as string,
      fullName,
      email,
      role,
    } satisfies Colleague,
  };
}

export async function setColleagueRole(staffId: string, nextRole: StaffRole) {
  const role = parseStaffRole(nextRole);
  if (!role) throw new StaffTeamError(STAFF_COPY.role);
  const admin = createServiceClient();
  const roster = await loadRoster(admin);
  const target = roster.find((row) => row.id === staffId);
  if (!target) throw new StaffTeamError(STAFF_COPY.notFound, 404);
  const adminCount = roster.filter((row) => row.role === "admin").length;
  const block = roleChangeBlockReason({
    targetRole: target.role,
    nextRole: role,
    adminCount,
  });
  if (block) throw new StaffTeamError(block, 403);
  if (target.role === role) return { role };

  const { data: updated, error } = await admin
    .from("crm_staff")
    .update({ role })
    .eq("id", staffId)
    .eq("role", target.role)
    .select("id")
    .maybeSingle();
  if (error) throw new StaffTeamError(STAFF_COPY.roleSave, 502);
  if (!updated) throw new StaffTeamError(STAFF_COPY.changed, 409);

  if (role === "agent") {
    const { count } = await admin
      .from("crm_staff")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) < 1) {
      await admin.from("crm_staff").update({ role: "admin" }).eq("id", staffId);
      throw new StaffTeamError(STAFF_COPY.lastAdmin, 403);
    }
  }

  const { data: fresh } = await admin.auth.admin.getUserById(target.auth_user_id);
  const meta = { ...(fresh.user?.app_metadata || {}) };
  try {
    await writeAppMetadata(admin, target.auth_user_id, { ...meta, crm_role: role });
  } catch (err) {
    await admin.from("crm_staff").update({ role: target.role }).eq("id", staffId);
    throw err;
  }
  return { role };
}

export async function removeColleague(staffId: string, actorId: string) {
  const admin = createServiceClient();
  const roster = await loadRoster(admin);
  const target = roster.find((row) => row.id === staffId);
  if (!target) throw new StaffTeamError(STAFF_COPY.notFound, 404);
  const block = removalBlockReason({
    actorId,
    targetId: target.id,
    targetRole: target.role,
  });
  if (block) throw new StaffTeamError(block, 403);

  const { data: customer } = await admin
    .from("crm_customers")
    .select("id")
    .eq("auth_user_id", target.auth_user_id)
    .maybeSingle();
  const plan = removalAuthPlan(Boolean(customer));

  if (plan === "keep-client") {
    const { data: removed, error } = await admin
      .from("crm_staff")
      .delete()
      .eq("id", target.id)
      .eq("role", "agent")
      .select("id");
    if (error || !removed?.length) throw new StaffTeamError(STAFF_COPY.changed, 409);
    try {
      const { data: fresh } = await admin.auth.admin.getUserById(target.auth_user_id);
      const meta = { ...(fresh.user?.app_metadata || {}) };
      await writeAppMetadata(admin, target.auth_user_id, { ...meta, crm_role: "client" });
    } catch (err) {
      await admin.from("crm_staff").insert({
        id: target.id,
        auth_user_id: target.auth_user_id,
        role: "agent",
        full_name: target.full_name,
      });
      throw err;
    }
    return { ok: true as const };
  }

  const { error } = await admin.auth.admin.deleteUser(target.auth_user_id);
  if (error) throw new StaffTeamError("Impossible de retirer ce collègue.", 502);
  await admin.from("crm_staff").delete().eq("id", target.id);
  return { ok: true as const };
}

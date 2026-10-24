/**
 * Garde des routes `/api/admin` : droit, périmètre du dossier, journal.
 * Avant la migration, un administrateur ou un agent garde l’accès d’aujourd’hui.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  accessTokenClaims,
  isAgencyRole,
  matrixFromRows,
  roleAllows,
  type PermissionMatrix,
  type StaffRole,
} from "@/lib/crm/agency-access";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { agencyGateDecision, classifyAgencyRoute, entityIdFromPath } from "@/lib/crm/agency-routes";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";

const BOOKING_UUID = /\/bookings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function clientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}

export async function gateAgencyApi(request: NextRequest) {
  const classified = classifyAgencyRoute(request.method, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (!classified || classified.audience === "public") return NextResponse.next();

  let response = NextResponse.next({ request });
  const { url, anonKey } = publicSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...AUTH_COOKIE_OPTIONS, ...options });
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const staff = await readStaff(supabase, user.id);
  const role = staff?.role ?? null;
  const active = staff?.active !== false;
  const matrix = await readMatrix(supabase);
  const permission = classified.permission;
  const allows = role && permission ? roleAllows(role, permission, matrix.rows) : false;
  const bookingId = request.nextUrl.pathname.match(BOOKING_UUID)?.[1] ?? null;
  const needsScope = Boolean(
    bookingId && role && role !== "partner" && !roleAllows(role, "view_all_dossiers", matrix.rows)
  );
  const bookingVisible = needsScope && bookingId ? await bookingIsVisible(supabase, bookingId) : null;

  const decision = agencyGateDecision({
    role,
    active: Boolean(staff) && active,
    matrixReady: matrix.ready,
    audience: classified.audience,
    permission,
    allows,
    bookingScoped: needsScope,
    bookingVisible,
  });
  if (!decision.allow) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status });
  }

  if (staff && (await sessionRevoked(supabase, user))) {
    return NextResponse.json({ error: "Session fermée." }, { status: 401 });
  }

  if (classified.journal && staff) {
    await recordAgencyJournal({
      staffId: staff.id,
      action: classified.action,
      entityType: classified.entity,
      entityId: entityIdFromPath(request.nextUrl.pathname),
      summary: classified.summary,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      path: request.nextUrl.pathname,
      sensitive: classified.sensitive,
    });
  }

  return response;
}

type StaffRow = { id: string; role: StaffRole; active: boolean };

async function readStaff(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<StaffRow | null> {
  const first = await supabase.from("crm_staff").select("id, role, active").eq("auth_user_id", userId).maybeSingle();
  const data = first.error
    ? (await supabase.from("crm_staff").select("id, role").eq("auth_user_id", userId).maybeSingle()).data
    : first.data;
  if (!data?.role) return null;
  const role = data.role as string;
  if (role !== "partner" && !isAgencyRole(role)) return null;
  return {
    id: data.id as string,
    role: role as StaffRole,
    active: first.error ? true : (data as { active?: boolean }).active !== false,
  };
}

async function readMatrix(
  supabase: ReturnType<typeof createServerClient>
): Promise<{ ready: boolean; rows: PermissionMatrix | null }> {
  const { data, error } = await supabase.from("crm_role_permissions").select("role, permission, allowed");
  if (error || !data) return { ready: false, rows: null };
  return {
    ready: true,
    rows: matrixFromRows(data as { role: string; permission: string; allowed: boolean }[]),
  };
}

async function bookingIsVisible(supabase: ReturnType<typeof createServerClient>, bookingId: string) {
  const { data, error } = await supabase.from("crm_bookings").select("id").eq("id", bookingId).maybeSingle();
  if (error) return null;
  return Boolean(data);
}

async function sessionRevoked(
  supabase: ReturnType<typeof createServerClient>,
  user: { app_metadata?: Record<string, unknown> }
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = accessTokenClaims(session?.access_token);
  const revokedAt = user.app_metadata?.sessions_revoked_at;
  if (typeof revokedAt === "string" && claims.iat != null) {
    const stamp = Date.parse(revokedAt);
    if (Number.isFinite(stamp) && claims.iat * 1000 < stamp) return true;
  }
  if (!claims.sessionId) return false;
  const { data, error } = await supabase
    .from("crm_staff_sessions")
    .select("revoked_at")
    .eq("session_id", claims.sessionId)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { revoked_at?: string | null }).revoked_at);
}

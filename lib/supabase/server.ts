import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();

  return createServerClient(
    url,
    anonKey,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...AUTH_COOKIE_OPTIONS,
                ...options,
              })
            );
          } catch {
            // Called from a Server Component — middleware will refresh sessions.
          }
        },
      },
    }
  );
}

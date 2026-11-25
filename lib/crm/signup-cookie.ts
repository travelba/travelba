import { VIEW_TOKEN_TTL_MS } from "@/lib/crm/signup";
import { SIGNUP_COOKIE } from "@/lib/crm/signup-options";

export function signupCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(VIEW_TOKEN_TTL_MS / 1000),
  };
}

export { SIGNUP_COOKIE };

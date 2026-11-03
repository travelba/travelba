import assert from "node:assert/strict";
import test from "node:test";
import type { JwtPayload } from "@supabase/supabase-js";
import { readVerifiedUser, userFromClaims } from "./verified-user";

test("userFromClaims lit l’identité et le rôle sans appel Auth", () => {
  const claims = {
    sub: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "camille@example.com",
    app_metadata: { crm_role: "client", must_set_password: false },
    user_metadata: { prenom: "Camille" },
  } as unknown as JwtPayload;
  const user = userFromClaims(claims);
  assert.equal(user?.id, claims.sub);
  assert.equal(user?.email, "camille@example.com");
  assert.equal(user?.app_metadata.crm_role, "client");
  assert.equal(user?.user_metadata.prenom, "Camille");
  assert.equal(userFromClaims({} as unknown as JwtPayload), null);
  assert.equal(userFromClaims(null), null);
});

test("readVerifiedUser ignore un jeton refusé", async () => {
  const missing = await readVerifiedUser({
    auth: { getClaims: async () => ({ data: null, error: { message: "bad" } }) },
  });
  assert.equal(missing, null);
  const ok = await readVerifiedUser({
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: "abc", aud: "authenticated", app_metadata: {} } as unknown as JwtPayload },
        error: null,
      }),
    },
  });
  assert.equal(ok?.id, "abc");
});

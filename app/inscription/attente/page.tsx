import { cookies } from "next/headers";
import { SignupStatusPanel } from "@/components/inscription/SignupStatusPanel";
import { SIGNUP_COOKIE } from "@/lib/crm/signup";
import { readSignupStatus } from "@/lib/crm/signup-run";

export default async function AttentePage() {
  const jar = await cookies();
  const token = jar.get(SIGNUP_COOKIE)?.value || "";
  const status = token ? await readSignupStatus(token) : null;
  return <SignupStatusPanel status={status} />;
}

/**
 * Identifiants REST Twilio. Une clé API (TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET)
 * prime sur le jeton du compte. Le SID du compte reste dans les URL.
 * La signature des webhooks exige toujours TWILIO_AUTH_TOKEN.
 */
export function twilioApiSecret(): string | undefined {
  const keySid = process.env.TWILIO_API_KEY_SID?.trim();
  const keySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  if (keySid && keySecret) return keySecret;
  return process.env.TWILIO_AUTH_TOKEN;
}

export function twilioApiUser(accountSid: string | null | undefined): string {
  const keySid = process.env.TWILIO_API_KEY_SID?.trim();
  const keySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  return keySid && keySecret ? keySid : String(accountSid ?? "");
}

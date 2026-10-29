# Ratehawk egress — static IP

ETG whitelists source IPs. Vercel functions use dynamic egress unless Static IPs are enabled. Travel BA production project is `prj_NAEfKYyndp7T68G2wKOguSCgtPUr` (team `team_bTvGnpMBL2dVrz8vXQ6vb3eZ`, region `cdg1`).

## Option A — Vercel Static IPs

1. Open the project on Vercel and enable Static IPs: https://vercel.com/docs/connectivity/static-ips
2. Attach the static egress to the production environment (and to preview only if sandbox calls must also leave from a stable address).
3. Copy the published address list into the ETG IP whitelist form.
4. Leave `RATEHAWK_HTTPS_PROXY` empty. The ETG client then uses the function’s own egress.

## Option B — HTTP proxy

Set `RATEHAWK_HTTPS_PROXY` to an `http://` or `https://` proxy URL whose egress IP is the one ETG will whitelist. The client uses an undici `ProxyAgent` for API calls and for the region-dump download. The proxy URL is not written to logs. Redirects on API calls are refused so a proxy cannot bounce the call onto the other ETG host.

Do not point sandbox keys at `api.ratehawk.com` or production keys at `api-sandbox.ratehawk.com`. `RATEHAWK_ENV=production` is rejected when `VERCEL_ENV=preview`.

## What to send ETG

The address list is not known in this repository. After Static IPs or the proxy is in place, paste the addresses in the checklist line “Here are our IP addresses”. Until then the answer is: list not available yet; dynamic Vercel egress will not be used for certified traffic.

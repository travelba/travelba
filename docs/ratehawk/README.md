# Ratehawk / ETG v3

Certification pack for the Travel BA admin integration.

| Document | Contents |
| --- | --- |
| [workflow.md](./workflow.md) | Step, agency action, ETG endpoint, timeouts, price rules |
| [errors.md](./errors.md) | Front and back tables for form, finish, status, cancel, webhook |
| [checklist.md](./checklist.md) | Draft answer for every ETG pre-certification item, including RPM |
| [certification-tests.md](./certification-tests.md) | How to run the seven sandbox bookings and record `partner_order_id` |
| [egress.md](./egress.md) | Vercel Static IPs and `RATEHAWK_HTTPS_PROXY` |

Environment variables are listed in `.env.example` (`RATEHAWK_*`). No key is stored in git.

## Still required before ETG can certify

- Sandbox `RATEHAWK_KEY_ID` and `RATEHAWK_API_KEY` on Vercel (production environment for the live admin, or a protected preview). Do not set production ETG on preview.
- `RATEHAWK_AGENCY_EMAIL` (and optional `RATEHAWK_AGENCY_PHONE`) — corporate address sent as `user.email`.
- Apply `supabase/migrations/20261021150000_ratehawk.sql`. Bookings and the content catalogue cannot be stored before that.
- Static egress: Vercel Static IPs or `RATEHAWK_HTTPS_PROXY`, then send the address list to ETG.
- `CRON_SECRET` already gates `/api/cron/ratehawk-content`.
- Optional: `RATEHAWK_WEBHOOK_TOKEN`, then send `https://travelba.fr/api/webhooks/ratehawk` to ETG. Until the token exists the route answers 503. The webhook is not the success signal.
- Run the seven bookings in [certification-tests.md](./certification-tests.md) and fill the `partner_order_id` table.
- Give ETG a staff login or a screen recording. Access has not been granted.
- Production host `https://api.ratehawk.com` and `RATEHAWK_ENV=production` only after ETG confirms the sandbox tests.

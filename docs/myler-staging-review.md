# MyLER staging review

Paste the block below to Nico (Joao and Phil can use the same steps). Do not attach the staging API key. `https://travelba.fr` shows **Clé de test : absente** on purpose: production does not call `api-staging.littleemperors.com`.

Preview (this branch, key is on every Vercel Preview):

`https://travelba-git-cursor-myler-staging-review-025e-travelba.vercel.app`

Share link, valid until 2026-10-16 11:09:49 UTC. It opens Travelba sign-in without a Vercel login. The previous share token is revoked.

`https://travelba-git-cursor-myler-staging-review-025e-travelba.vercel.app/admin/login?espace=myler&_vercel_share=HjnW4YLyQAhKWU8d0JSloUQaALZkTX3Q`

---

Hello Nico,

Staging review for the MyLER integration. About ten minutes. No production API key is in use, and we are not asking for one until you say this looks complete.

1. Open the Preview Share link above first (not https://travelba.fr). It is valid until 2026-10-16 11:09:49 UTC. If Vercel asks you to sign in, use that Share link.
2. Open the Travelba email “Your Little Emperors access” and click **Set your password**. The link lasts 30 days. That password is the Travelba sign-in. SSO POST /v1/login is not used. If that button asks for a Vercel login, open the Share link above, then use the button again.
3. Go to `/admin/login?espace=myler`. The page is titled **Travelba sign-in**. Sign in with nico@littleemperors.com and the password you just set. You land only on Little Emperors. The sidebar reads **MyLER partner**. There is no client list and no ledger.
4. The page title is Little Emperors. The line under it names the test key, **Refresh**, the v2 routes, and the webhook. Under **MyLER integration**, check:
   - Host `api-staging.littleemperors.com`
   - **Test key: present.**
   - **v2 routes:** `GET /v2/hotels/bookings`, `GET /v2/hotels/{id}`, `DELETE /v2/hotels/bookings/{id}`
   - Webhook `https://travelba.fr/api/webhooks/little-emperors`, header `X-Access-Key`. The webhook secret is absent until you want push events. **Refresh** does not need it.
   - The line: SSO POST /v1/login is not used for MyLER. Sign-in is the Travelba account.
5. Click **Refresh**. It calls `GET /v2/hotels/bookings` on staging. Expected text: “The test environment answered. No reservations yet: that is expected, staging has none.” An empty list is a successful call. Nothing is published to a traveller. Reload the page: the same sentence stays, with the date of the last read.
6. `https://travelba.fr` keeps the French agency screen **Clé de test : absente**. That is correct until you send the production API key.

If that matches what you see, the production API key is the next step on our side.

---

## Invite (Benjamin, admin)

Do not send this until you are ready for Nico to open it. The partner email and the partner screens are English. The agency team page stays French.

Nico is already **Partenaire MyLER**. **Ajouter** again says he is already on the team. He has not set a password yet.

On `https://travelba.fr` (same accounts as Preview):

1. `/admin/login`
2. **Équipe**
3. On Nico Santos’s row, **Renvoyer le lien**
4. The email subject is “Your Little Emperors access”. It asks him to set a password and says SSO POST /v1/login is not used. Copy the link if the email does not arrive. It is valid for 30 days.
5. A new partner uses the same form: nom, e-mail, rôle **Partenaire MyLER**, **Ajouter**
6. Send him the Preview Share link plus the English block above. Ask him to judge the key on Preview, not on travelba.fr. Sign-in on the Preview is `/admin/login?espace=myler`.

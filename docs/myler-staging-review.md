# MyLER staging review

Paste the block below to Nico (Joao and Phil can use the same steps). Do not attach the staging API key. The review page is Travel BA’s internal back office (CRM, not a public website; Little Emperors’ CTO confirmed that on 24 September). That staging deployment calls the Little Emperors staging API with the test key. `https://travelba.fr` calls the Little Emperors production API.

Preview (this branch, key is on every Vercel Preview):

`https://travelba-git-cursor-myler-staging-review-025e-travelba.vercel.app`

Share link, valid until 2026-10-22 15:41:30 UTC. It opens the Little Emperors review page without a Vercel login. The previous share token is revoked.

`https://travelba-git-cursor-myler-staging-review-025e-travelba.vercel.app/admin/little-emperors?_vercel_share=8RQGFEe6WY5KDtZtQ5xMmRSDvcXNgZsj`

---

Hello Nico,

Staging review for the MyLER integration. About ten minutes. This preview uses the test key on the staging API. Production (travelba.fr) calls the production API. Refresh only reads bookings. Nothing is booked from this screen.

1. You will receive a Travelba email, “Your Little Emperors access”, for nico@littleemperors.com. Open **Set your password**. The link lasts 30 days. That password is the Travelba sign-in. SSO POST /v1/login is not used.
2. Open the Preview Share link above (not https://travelba.fr). It is valid until 2026-10-22 15:41:30 UTC. If Vercel asks you to sign in, use that Share link.
3. Go to `/admin/login?espace=myler`. The page is titled **Travelba sign-in**. Sign in with nico@littleemperors.com and the password you just set. You land only on Little Emperors. The sidebar reads **MyLER partner**. There is no client list and no ledger.
4. The page title is Little Emperors. The block at the top is **Travel BA internal back office**. It says this CRM is not a public website, that agents and AI assistants list Little Emperors bookings, match them to clients, and view or cancel them, and that this staging deployment calls the staging API with the test key while production calls the production API. It names the endpoints and the webhook. Under **MyLER integration**, check:
   - Host `api-staging.littleemperors.com`
   - **Test key: present.**
   - The line: this staging deployment calls the Little Emperors staging API with the test key. Production calls the Little Emperors production API.
   - **v2 routes:** `GET /v2/hotels/bookings`, `GET /v2/hotels/{id}`, `DELETE /v2/hotels/bookings/{id}`
   - Webhook `https://travelba.fr/api/webhooks/little-emperors`, header `X-Access-Key`. The webhook secret is absent until you want push events. **Refresh** does not need it.
   - The line: SSO POST /v1/login is not used for MyLER. Sign-in is the Travelba account.
5. Click **Refresh**. It calls `GET /v2/hotels/bookings` on the staging API. Expected text: “The staging API answered. No reservations yet: that is expected, staging has none.” An empty list is a successful call. Nothing is published to a traveller. Reload the page: the same sentence stays, with the date of the last read.
6. `https://travelba.fr` shows the French agency screen: production calls the Little Emperors production API. When `LITTLE_EMPERORS_API_KEY` is set on Vercel Production, the line is **Clé de production : présente.** The value is not shown. The test key stays on the staging review.

If that matches what you see, the staging review still matches this screen. Production reads with the production key.

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
6. Send him the Preview Share link plus the English block above. The test key is on the staging review. travelba.fr calls the production API. Sign-in on the Preview is `/admin/login?espace=myler`.

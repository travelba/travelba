# MyLER staging review

Paste the block below to Nico (Joao and Phil can use the same steps). Do not attach the staging API key. `https://travelba.fr` shows **Clé de test : absente** on purpose: production does not call `api-staging.littleemperors.com`.

Preview (this branch, key is on every Vercel Preview):

`https://travelba-git-cursor-myler-staging-review-025e-travelba.vercel.app`

Preview deployments sit behind Vercel Authentication. Send the deployment **Share** link with this note so the review opens straight on Travelba login.

---

Hello Nico,

Staging review for the MyLER integration. About ten minutes. No production API key is in use, and we are not asking for one until you say this looks complete.

1. You will receive a Travelba link for nico@littleemperors.com (role Partenaire MyLER). Open it and set a password. The link lasts 30 days. That password is the Travelba login. It is not Little Emperors SSO.
2. Open the Preview link in this email (not https://travelba.fr). If Vercel asks you to sign in, use the Share link from the same email.
3. Go to `/admin/login`. Sign in with nico@littleemperors.com and the password you just set. You should land only on Little Emperors. There is no client list and no ledger.
4. On the page, under **Intégration MyLER**, check:
   - Host `api-staging.littleemperors.com`
   - **Clé de test : présente.**
   - **Routes v2:** `GET /v2/hotels/bookings`, `GET /v2/hotels/{id}`, `DELETE /v2/hotels/bookings/{id}`
   - Webhook `https://travelba.fr/api/webhooks/little-emperors`, header `X-Access-Key`. The webhook secret is absent until you want push events. **Actualiser** does not need it.
   - The line: the SSO `POST /v1/login` is not used for MyLER. Login is the Travelba account.
5. Click **Actualiser**. It calls `GET /v2/hotels/bookings` on staging. Expected text: the staging environment answered, and there are no reservations yet. An empty list is a successful call. Nothing is published to a traveller.
6. `https://travelba.fr` will keep showing **Clé de test : absente**. That is correct until you send the production API key.

If that matches what you see, the production API key is the next step on our side.

---

## Invite (Benjamin, admin)

Nico is already **Partenaire MyLER**. **Ajouter** again says he is already on the team. He has not set a password yet.

On `https://travelba.fr` (same accounts as Preview):

1. `/admin/login`
2. **Équipe**
3. On Nico Santos’s row, **Renvoyer le lien**
4. The email asks him to set a password and says he only opens Little Emperors. Copy the link if the email does not arrive. It is valid for 30 days.
5. A new partner uses the same form: nom, e-mail, rôle **Partenaire MyLER**, **Ajouter**
6. Send him the Preview Share link plus the English block above. Ask him to judge the key on Preview, not on travelba.fr.

/** Pages locales. Aucun prestataire n’est contacté. */

const FIELDS = `
  <form method="post">
    <input autocomplete="cc-number" name="number" />
    <input autocomplete="cc-exp" name="expiry" />
    <input autocomplete="cc-csc" name="cvc" />
    <button type="submit">Payer</button>
  </form>
`;

export function stripeCheckoutHtml(amount: string) {
  return `<main data-checkout="stripe"><h1>Paiement</h1><p>Total ${amount}</p>${FIELDS}</main>`;
}

export function adyenCheckoutHtml(amount: string) {
  return `<main data-checkout="adyen"><p class="adyen-checkout__amount">${amount}</p>${FIELDS}</main>`;
}

export function worldpayCheckoutHtml(amount: string) {
  return `<main data-checkout="worldpay"><p>Amount due ${amount}</p>${FIELDS}</main>`;
}

export function threeDsHtml() {
  return `<main><h1>3D Secure</h1><p>Authentication required</p>${FIELDS}</main>`;
}

export function paidHtml() {
  return `<main><p>Thank you for your payment</p><p>731,90 EUR</p></main>`;
}

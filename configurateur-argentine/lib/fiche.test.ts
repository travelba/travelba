import assert from "node:assert/strict";
import test from "node:test";
import { isPublicHttpUrl, parseOfficialHtml } from "./fiche";

test("les adresses internes sont refusées", () => {
  assert.equal(isPublicHttpUrl("https://www.hotelxelena.com/"), true);
  assert.equal(isPublicHttpUrl("http://127.0.0.1/secret"), false);
  assert.equal(isPublicHttpUrl("https://192.168.1.8/photo.jpg"), false);
  assert.equal(isPublicHttpUrl("https://10.0.0.4/"), false);
  assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
  assert.equal(isPublicHttpUrl("https://localhost/hotel"), false);
});

test("la fiche ne garde que les photos de la page officielle", () => {
  const html = `
    <html><head>
      <title>Xelena Hotel</title>
      <meta property="og:title" content="Xelena Hotel &amp; Suites">
      <meta property="og:description" content="Au bord du lac Argentino.">
      <meta property="og:image" content="/photos/lac.jpg">
      <meta name="description" content="ignorée si og présent">
    </head>
    <body>
      <img src="/assets/logo.svg" alt="logo">
      <img src="https://cdn.exemple.test/suite.jpg" alt="Suite lac">
      <img src="/pixel.gif" alt="tracking pixel">
    </body></html>`;
  const parsed = parseOfficialHtml(html, "https://www.hotelxelena.com/sejour");
  assert.equal(parsed.title, "Xelena Hotel & Suites");
  assert.equal(parsed.description, "Au bord du lac Argentino.");
  assert.deepEqual(parsed.imageUrls, [
    "https://www.hotelxelena.com/photos/lac.jpg",
    "https://cdn.exemple.test/suite.jpg",
  ]);
});

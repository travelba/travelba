import assert from "node:assert/strict";
import test from "node:test";
import { isAppleWalletDevice } from "./apple-device";

test("le badge Wallet ne s’affiche que sur un appareil Apple", () => {
  assert.equal(
    isAppleWalletDevice(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
    ),
    true
  );
  assert.equal(
    isAppleWalletDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    true
  );
  assert.equal(
    isAppleWalletDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    false
  );
  assert.equal(
    isAppleWalletDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"),
    false
  );
  assert.equal(isAppleWalletDevice("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"), false);
});

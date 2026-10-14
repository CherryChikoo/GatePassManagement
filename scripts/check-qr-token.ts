/**
 * Checks the compact live QR code: size, round trip, tampering and expiry.
 *   npx tsx scripts/check-qr-token.ts
 */
import assert from "node:assert/strict";
process.loadEnvFile(".env");

async function main() {
  const { generateCompactLiveQr, verifyScannedQr, generateLiveQrJwt } = await import("../src/lib/qr/token");
  const permissionId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  const tokenId = "9b2d8c1a-7e4f-4c3b-8a2d-1f0e9d8c7b6a";
  const code = generateCompactLiveQr({ permissionId, tokenId, expiresAt: new Date(Date.now() + 3600_000) });
  const jwt = await generateLiveQrJwt({ permissionId, tokenId, ownerId: tokenId, expiresAt: new Date(Date.now() + 3600_000) });
  console.log(`compact code: ${code.length} chars (old JWT: ${jwt.length} chars)`);

  const ok = await verifyScannedQr(code);
  assert.ok(ok.valid && ok.payload?.permissionId === permissionId && ok.payload?.tokenId === tokenId, "round trip");
  const tampered = code.slice(0, 10) + (code[10] === "a" ? "b" : "a") + code.slice(11);
  assert.equal((await verifyScannedQr(tampered)).valid, false, "tampered code rejected");
  const expired = generateCompactLiveQr({ permissionId, tokenId, expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await verifyScannedQr(expired)).valid, false, "expired code rejected");
  assert.equal((await verifyScannedQr(jwt)).valid, true, "legacy JWT still accepted");
  assert.equal((await verifyScannedQr("hello")).valid, false, "random text rejected");
  console.log("all QR checks passed");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

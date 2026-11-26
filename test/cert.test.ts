import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildCertificate, canonicalJson, certificateHash, memoFor, parseCertificate, sha256Hex } from "../scripts/lib/cert.js";
import { allOk, checkAnchorTx, type TxLookup } from "../scripts/lib/check.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/hybrid-send.json", import.meta.url), "utf8")) as TxLookup & { _note: string };
const issuer = (fixture.tx!.body!.messages![0] as { from_address: string }).from_address;

function makeCert(over: Partial<{ title: string; recipient: string }> = {}) {
  return buildCertificate({
    title: over.title ?? "Intro to post-quantum signatures",
    recipient: over.recipient ?? "Ada Example",
    issuer,
    chainId: "qorechain-diana",
    issuedAt: new Date("2026-11-27T10:00:00Z"),
  });
}

/** The fixture with its memo set to the certificate's memo. */
function lookupFor(hash: string): TxLookup {
  const copy = structuredClone(fixture) as TxLookup;
  copy.tx!.body!.memo = memoFor(hash);
  return copy;
}

describe("certificate hash", () => {
  it("does not depend on key order", () => {
    assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  });
  it("is the SHA-256 of the canonical form and changes with any field", () => {
    const c = makeCert();
    assert.equal(certificateHash(c), sha256Hex(canonicalJson(c)));
    assert.notEqual(certificateHash(c), certificateHash(makeCert({ title: "Intro to post-quantum signature" })));
  });
  it("rejects empty or oversized fields", () => {
    assert.throws(() => makeCert({ title: "  " }));
    assert.throws(() => makeCert({ recipient: "x".repeat(81) }));
    assert.throws(() => parseCertificate({ v: 2 }));
  });
});

describe("anchor transaction checks", () => {
  it("passes for a hybrid-signed transaction whose memo carries the hash", () => {
    const c = makeCert();
    const checks = checkAnchorTx(c, certificateHash(c), lookupFor(certificateHash(c)));
    assert.ok(allOk(checks), JSON.stringify(checks.filter((x) => !x.ok)));
    assert.ok(checks.find((x) => x.name === "post-quantum signature attached")!.detail.includes("bytes"));
  });
  it("fails when the title was changed after issuing", () => {
    const c = makeCert();
    const original = certificateHash(c);
    const tampered = { ...c, title: "Advanced post-quantum signatures" };
    const checks = checkAnchorTx(tampered, original, lookupFor(original));
    assert.ok(!allOk(checks));
    assert.equal(checks.find((x) => x.name === "certificate hash")!.ok, false);
    assert.equal(checks.find((x) => x.name === "memo carries the certificate hash")!.ok, false);
  });
  it("fails when the transaction was sent by someone else", () => {
    const c = { ...makeCert(), issuer: "qor1yrnfky7jq8tp33ftr6qrh43jp3gsx7a6jy6stv" };
    const checks = checkAnchorTx(c, undefined, lookupFor(certificateHash(c)));
    assert.equal(checks.find((x) => x.name === "sent by the issuer")!.ok, false);
    assert.equal(checks.find((x) => x.name === "chain verified the hybrid signature")!.ok, false);
  });
  it("fails without the post-quantum extension or the verify event", () => {
    const c = makeCert();
    const l = lookupFor(certificateHash(c));
    l.tx!.body!.extension_options = [];
    l.tx_response!.events = [];
    const checks = checkAnchorTx(c, undefined, l);
    assert.equal(checks.find((x) => x.name === "post-quantum signature attached")!.ok, false);
    assert.equal(checks.find((x) => x.name === "chain verified the hybrid signature")!.ok, false);
  });
  it("fails for an unknown transaction", () => {
    assert.ok(!allOk(checkAnchorTx(makeCert(), undefined, undefined)));
  });
});

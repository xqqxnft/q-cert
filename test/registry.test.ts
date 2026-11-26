import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const H1 = `0x${"11".repeat(32)}` as const;
const H2 = `0x${"22".repeat(32)}` as const;

describe("CertRegistry", async () => {
  // Runs on Hardhat's simulated network; no QoreChain endpoint is needed.
  const { viem } = await network.create();
  const [issuer, other] = await viem.getWalletClients();

  it("records the issuer and time of a new certificate", async () => {
    const reg = await viem.deployContract("CertRegistry");
    await viem.assertions.emitWithArgs(reg.write.issue([H1]), reg, "Issued", [H1, issuer!.account.address]);
    const [who, at, revoked] = (await reg.read.statusOf([H1])) as readonly [string, bigint, boolean];
    assert.equal(who.toLowerCase(), issuer!.account.address.toLowerCase());
    assert.ok(at > 0n);
    assert.equal(revoked, false);
  });

  it("reports an unknown hash as the zero address", async () => {
    const reg = await viem.deployContract("CertRegistry");
    const [who] = (await reg.read.statusOf([H2])) as readonly [string, bigint, boolean];
    assert.equal(who, "0x0000000000000000000000000000000000000000");
  });

  it("refuses a duplicate or empty hash", async () => {
    const reg = await viem.deployContract("CertRegistry");
    await reg.write.issue([H1]);
    await viem.assertions.revertWithCustomError(reg.write.issue([H1]), reg, "AlreadyIssued");
    await viem.assertions.revertWithCustomError(reg.write.issue([`0x${"00".repeat(32)}`]), reg, "EmptyHash");
  });

  it("lets only the issuer revoke, once", async () => {
    const reg = await viem.deployContract("CertRegistry");
    await reg.write.issue([H1]);
    await viem.assertions.revertWithCustomError(reg.write.revoke([H1], { account: other!.account }), reg, "NotIssuer");
    await viem.assertions.revertWithCustomError(reg.write.revoke([H2]), reg, "UnknownCertificate");
    await viem.assertions.emitWithArgs(reg.write.revoke([H1]), reg, "Revoked", [H1, issuer!.account.address]);
    assert.equal(((await reg.read.statusOf([H1])) as readonly [string, bigint, boolean])[2], true);
    await viem.assertions.revertWithCustomError(reg.write.revoke([H1]), reg, "AlreadyRevoked");
  });
});

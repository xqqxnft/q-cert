/**
 * chain.ts - testnet settings and account loading for the Q-Cert scripts.
 *
 * The account comes from QORE_MNEMONIC, or from PRIVATE_KEY plus
 * QORE_PQC_RECOVERY_CODE, exactly as in scripts/window.ts (from the
 * create-qorechain-dapp template). Secrets are read from .env and never
 * printed.
 */
import {
  deriveUnifiedAccount,
  isValidRecoveryCode,
  unifiedAccountFromSeed,
  type UnifiedAccount,
} from "@qorechain/sdk";

export const TESTNET = {
  chainId: "qorechain-diana",
  evmChainId: 9800,
  rest: "https://api-testnet.qore.host",
  rpc: "https://rpc-testnet.qore.host",
  evm: "https://evm-testnet.qore.host",
  explorer: "https://explore.qore.network",
} as const;

export async function loadAccount(): Promise<UnifiedAccount> {
  if ((process.env.QORE_NETWORK ?? "testnet") !== "testnet") {
    throw new Error("Q-Cert is testnet only: set QORE_NETWORK=testnet");
  }
  const mnemonic = process.env.QORE_MNEMONIC?.trim();
  if (mnemonic) return await deriveUnifiedAccount(mnemonic, 0);
  const key = process.env.PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("Set QORE_MNEMONIC, or PRIVATE_KEY (0x + 64 hex) with QORE_PQC_RECOVERY_CODE, in .env");
  }
  const recoveryCode = process.env.QORE_PQC_RECOVERY_CODE?.trim();
  if (!recoveryCode || !isValidRecoveryCode(recoveryCode)) {
    throw new Error("Set a valid QORE_PQC_RECOVERY_CODE (QRC1...) in .env");
  }
  return unifiedAccountFromSeed(Uint8Array.from(Buffer.from(key.slice(2), "hex")), { recoveryCode });
}

/** account_number and sequence over REST. */
export async function accountSequence(address: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const res = await fetch(`${TESTNET.rest}/cosmos/auth/v1beta1/accounts/${address}`);
  if (res.status === 404) throw new Error(`${address} does not exist on chain yet: get test QOR from the faucet first`);
  if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
  const body = (await res.json()) as { account?: Record<string, unknown> };
  const acc = (body.account?.base_account ?? body.account ?? {}) as Record<string, string>;
  return { accountNumber: BigInt(acc.account_number ?? "0"), sequence: BigInt(acc.sequence ?? "0") };
}

export function explorerTx(hash: string): string {
  return `${TESTNET.explorer}/tx/${hash}`;
}

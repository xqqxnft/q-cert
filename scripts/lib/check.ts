/**
 * check.ts - decide whether a certificate is backed by a hybrid-signed
 * QoreChain transaction. Pure functions over the REST JSON, so they are easy
 * to test without a network.
 *
 * What is checked, and what is not:
 *  - The chain's validators verify the ML-DSA-87 signature when they process a
 *    transaction; success is recorded as a `pqc_hybrid_verify` event with
 *    status `verified`. We read that event, and the `PQCHybridSignature`
 *    extension in the transaction body. We do NOT re-run ML-DSA-87 here.
 */
import { MEMO_PREFIX, certificateHash, memoFor, type Certificate } from "./cert.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

interface TxEvent {
  type: string;
  attributes?: { key: string; value: string }[];
}

export interface TxLookup {
  tx?: {
    body?: {
      messages?: Record<string, unknown>[];
      memo?: string;
      extension_options?: Record<string, unknown>[];
    };
  };
  tx_response?: { code?: number; txhash?: string; events?: TxEvent[] };
}

const HYBRID_EXT = "/qorechain.pqc.v1.PQCHybridSignature";

function attr(ev: TxEvent, key: string): string | undefined {
  return ev.attributes?.find((a) => a.key === key)?.value;
}

export function checkAnchorTx(cert: Certificate, claimedHash: string | undefined, lookup: TxLookup | undefined): Check[] {
  const checks: Check[] = [];
  const hash = certificateHash(cert);
  checks.push({
    name: "certificate hash",
    ok: claimedHash === undefined || claimedHash === hash,
    detail: claimedHash === undefined ? `computed ${hash}` : claimedHash === hash ? `matches ${hash}` : `stored ${claimedHash} but certificate hashes to ${hash}`,
  });

  if (!lookup?.tx || !lookup.tx_response) {
    checks.push({ name: "anchor transaction found", ok: false, detail: "no transaction returned for this hash" });
    return checks;
  }
  checks.push({ name: "anchor transaction found", ok: true, detail: lookup.tx_response.txhash ?? "" });
  checks.push({
    name: "transaction succeeded",
    ok: lookup.tx_response.code === 0,
    detail: `code ${String(lookup.tx_response.code)}`,
  });

  const memo = lookup.tx.body?.memo ?? "";
  checks.push({
    name: "memo carries the certificate hash",
    ok: memo === memoFor(hash),
    detail: memo.startsWith(MEMO_PREFIX) ? `memo hash ${memo.slice(MEMO_PREFIX.length)}` : `memo is "${memo}"`,
  });

  const msg = lookup.tx.body?.messages?.[0];
  const sender = (msg?.["from_address"] ?? msg?.["sender"]) as string | undefined;
  checks.push({
    name: "sent by the issuer",
    ok: sender === cert.issuer,
    detail: `sender ${sender ?? "unknown"}, certificate issuer ${cert.issuer}`,
  });

  const ext = lookup.tx.body?.extension_options?.find((e) => e["@type"] === HYBRID_EXT);
  const sigLen = typeof ext?.["pqc_signature"] === "string" ? Buffer.from(ext["pqc_signature"] as string, "base64").length : 0;
  checks.push({
    name: "post-quantum signature attached",
    ok: sigLen > 0,
    detail: sigLen > 0 ? `ML-DSA-87 signature, ${sigLen} bytes` : "no PQCHybridSignature extension",
  });

  const ev = lookup.tx_response.events?.find((e) => e.type === "pqc_hybrid_verify");
  const status = ev ? attr(ev, "status") : undefined;
  const evAddr = ev ? attr(ev, "address") : undefined;
  checks.push({
    name: "chain verified the hybrid signature",
    ok: status === "verified" && evAddr === cert.issuer,
    detail: ev ? `pqc_hybrid_verify status=${status ?? "?"} address=${evAddr ?? "?"}` : "no pqc_hybrid_verify event",
  });
  return checks;
}

export function allOk(checks: Check[]): boolean {
  return checks.every((c) => c.ok);
}

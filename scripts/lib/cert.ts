/**
 * cert.ts - the Q-Cert certificate format and its hash.
 *
 * A certificate is a small JSON object. Its hash is the SHA-256 of the
 * canonical form (keys sorted, no whitespace), so the same certificate always
 * gives the same hash on any machine.
 */
import { createHash } from "node:crypto";

export const CERT_VERSION = 1;
export const MEMO_PREFIX = "qcert:v1:";

export interface Certificate {
  v: number;
  title: string;
  recipient: string;
  /** SHA-256 (hex) of an optional attached file; empty string when none. */
  fileSha256: string;
  /** ISO 8601 UTC time of issue. */
  issuedAt: string;
  /** The issuer's qor1... address. */
  issuer: string;
  /** The chain the certificate is anchored on, e.g. qorechain-diana. */
  chainId: string;
}

export interface AnchoredCertificate {
  certificate: Certificate;
  /** Hash of the canonical certificate (hex, 64 chars). */
  certHash: string;
  /** Hash of the native QoreChain transaction that carries certHash in its memo. */
  txHash: string;
  /** Optional EVM registry the hash was also written to. */
  registry?: { address: string; txHash?: string };
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** JSON with sorted keys and no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

export function certificateHash(cert: Certificate): string {
  return sha256Hex(canonicalJson(cert));
}

export function memoFor(certHash: string): string {
  return `${MEMO_PREFIX}${certHash}`;
}

export function buildCertificate(input: {
  title: string;
  recipient: string;
  fileSha256?: string;
  issuer: string;
  chainId: string;
  issuedAt?: Date;
}): Certificate {
  const title = input.title.trim();
  const recipient = input.recipient.trim();
  if (!title || title.length > 120) throw new Error("title must be 1-120 characters");
  if (!recipient || recipient.length > 80) throw new Error("recipient must be 1-80 characters");
  const fileSha256 = input.fileSha256 ?? "";
  if (fileSha256 && !/^[0-9a-f]{64}$/.test(fileSha256)) throw new Error("fileSha256 must be 64 hex characters");
  return {
    v: CERT_VERSION,
    title,
    recipient,
    fileSha256,
    issuedAt: (input.issuedAt ?? new Date()).toISOString(),
    issuer: input.issuer,
    chainId: input.chainId,
  };
}

/** Basic shape check for a certificate read from a file. */
export function parseCertificate(raw: unknown): Certificate {
  const c = raw as Partial<Certificate> | null;
  if (!c || typeof c !== "object") throw new Error("certificate is not an object");
  for (const k of ["title", "recipient", "fileSha256", "issuedAt", "issuer", "chainId"] as const) {
    if (typeof c[k] !== "string") throw new Error(`certificate.${k} must be a string`);
  }
  if (c.v !== CERT_VERSION) throw new Error(`unsupported certificate version ${String(c.v)}`);
  return c as Certificate;
}

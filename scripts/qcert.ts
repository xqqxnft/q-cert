/**
 * qcert.ts - Q-Cert command line.
 *
 *   pnpm qcert issue --title "..." --recipient "..." [--file path] [--out cert.qcert.json] [--registry 0x...] [--dry-run]
 *   pnpm qcert verify cert.qcert.json [--registry 0x...]
 *   pnpm qcert revoke cert.qcert.json --registry 0x...
 *
 * issue   hybrid-signs (secp256k1 + ML-DSA-87) a 1 uqor self-transfer whose memo
 *         is "qcert:v1:<sha256 of the certificate>", and saves the certificate
 *         with its transaction hash. With --registry it also records the hash
 *         in the CertRegistry contract.
 * verify  needs no secrets: recomputes the hash and reads the transaction from
 *         the public REST endpoint.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { StargateClient } from "@cosmjs/stargate";
import { EthNativeSigner, MSG_SEND_TYPE_URL } from "@qorechain/sdk";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildCertificate,
  certificateHash,
  memoFor,
  parseCertificate,
  sha256Hex,
  type AnchoredCertificate,
} from "./lib/cert.js";
import { TESTNET, accountSequence, explorerTx, loadAccount } from "./lib/chain.js";
import { allOk, checkAnchorTx, type TxLookup } from "./lib/check.js";

const REGISTRY_ABI = parseAbi([
  "function issue(bytes32 certHash)",
  "function revoke(bytes32 certHash)",
  "function statusOf(bytes32 certHash) view returns (address issuer, uint64 issuedAt, bool revoked)",
]);

const qoreTestnet = defineChain({
  id: TESTNET.evmChainId,
  name: "QoreChain testnet",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [TESTNET.evm] } },
});

/** Hybrid transactions are large; the gas limit is generous and the price is 0.15 uqor/gas. */
const FEE = { amount: [{ denom: "uqor", amount: "75000" }], gas: "500000" };

function args(argv: string[]): { flags: Record<string, string | true>; rest: string[] } {
  const flags: Record<string, string | true> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[a.slice(2)] = next;
        i++;
      } else flags[a.slice(2)] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

function need(flags: Record<string, string | true>, name: string): string {
  const v = flags[name];
  if (typeof v !== "string" || !v) throw new Error(`--${name} is required`);
  return v;
}

function asHex32(hex: string): Hex {
  return `0x${hex}` as Hex;
}

function registryAddress(v: string | true | undefined): Address | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error("--registry must be a 0x address");
  return v as Address;
}

async function issue(flags: Record<string, string | true>): Promise<void> {
  const acc = await loadAccount();
  const dry = flags["dry-run"] === true;
  const file = typeof flags.file === "string" ? sha256Hex(readFileSync(flags.file)) : undefined;
  const cert = buildCertificate({
    title: need(flags, "title"),
    recipient: need(flags, "recipient"),
    fileSha256: file,
    issuer: acc.cosmos,
    chainId: TESTNET.chainId,
  });
  const certHash = certificateHash(cert);
  const msg = {
    typeUrl: MSG_SEND_TYPE_URL,
    value: { fromAddress: acc.cosmos, toAddress: acc.cosmos, amount: [{ denom: "uqor", amount: "1" }] },
  };
  const signer = new EthNativeSigner(acc, { signMode: "hybrid", rest: TESTNET.rest });

  if (dry) {
    // Sign offline with placeholder account numbers; nothing is sent.
    const signed = signer.sign({
      chainId: TESTNET.chainId,
      accountNumber: 0n,
      sequence: 0n,
      fee: FEE,
      messages: [msg],
      memo: memoFor(certHash),
      signBytesVersion: "v2",
    });
    console.log(`dry run: hybrid transaction signed offline, nothing sent`);
    console.log(`certificate hash: ${certHash}`);
    console.log(`signed transaction size: ${JSON.stringify(signed, (_k, v) => (v instanceof Uint8Array ? `bytes(${v.length})` : typeof v === "bigint" ? v.toString() : v))}`);
    return;
  }

  const { accountNumber, sequence } = await accountSequence(acc.cosmos);
  const transport = await StargateClient.connect(TESTNET.rpc);
  let txHash: string;
  try {
    const res = await signer.signAndBroadcast(transport, {
      chainId: TESTNET.chainId,
      accountNumber,
      sequence,
      fee: FEE,
      messages: [msg],
      memo: memoFor(certHash),
    });
    if (res.code !== 0) throw new Error(`transaction rejected, code ${res.code}: ${res.rawLog ?? ""}`);
    txHash = res.transactionHash;
  } finally {
    transport.disconnect();
  }
  console.log(`hybrid-signed transaction: ${txHash}`);
  console.log(`explorer: ${explorerTx(txHash)}`);

  const out: AnchoredCertificate = { certificate: cert, certHash, txHash };
  const registry = registryAddress(flags.registry);
  if (registry) {
    const regTx = await registryWrite(registry, "issue", certHash);
    out.registry = { address: registry, txHash: regTx };
    console.log(`registry issue transaction: ${regTx}`);
  }
  const path = typeof flags.out === "string" ? flags.out : `${certHash.slice(0, 12)}.qcert.json`;
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`saved ${path}`);
}

async function registryWrite(registry: Address, fn: "issue" | "revoke", certHash: string): Promise<string> {
  // The EVM lane needs a live authorisation window first: pnpm window open.
  const key = process.env.PRIVATE_KEY?.trim();
  const acc = await loadAccount();
  const pk = (key && /^0x[0-9a-fA-F]{64}$/.test(key) ? key : acc.privateKey) as Hex;
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: qoreTestnet, transport: http(TESTNET.evm) });
  const pub = createPublicClient({ chain: qoreTestnet, transport: http(TESTNET.evm) });
  const hash = await wallet.writeContract({ address: registry, abi: REGISTRY_ABI, functionName: fn, args: [asHex32(certHash)] });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

async function fetchLookup(txHash: string): Promise<TxLookup | undefined> {
  const res = await fetch(`${TESTNET.rest}/cosmos/tx/v1beta1/txs/${txHash}`);
  if (res.status === 404 || res.status === 400) return undefined;
  if (!res.ok) throw new Error(`REST lookup failed: HTTP ${res.status}`);
  return (await res.json()) as TxLookup;
}

async function verify(file: string, flags: Record<string, string | true>): Promise<void> {
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<AnchoredCertificate>;
  const cert = parseCertificate(raw.certificate);
  const txHash = raw.txHash;
  if (!txHash) throw new Error("file has no txHash");
  const checks = checkAnchorTx(cert, raw.certHash, await fetchLookup(txHash));

  const registry = registryAddress(flags.registry) ?? (raw.registry?.address as Address | undefined);
  if (registry) {
    const pub = createPublicClient({ chain: qoreTestnet, transport: http(TESTNET.evm) });
    const [issuer, , revoked] = await pub.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "statusOf",
      args: [asHex32(certificateHash(cert))],
    });
    const known = issuer !== "0x0000000000000000000000000000000000000000";
    checks.push({ name: "registry lists the certificate", ok: known, detail: known ? `issuer ${issuer}` : "not in registry" });
    checks.push({ name: "not revoked", ok: known && !revoked, detail: revoked ? "revoked by issuer" : "active" });
  }

  for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name} - ${c.detail}`);
  const ok = allOk(checks);
  console.log(ok ? "\nVALID: both signatures were verified by the chain for this exact certificate." : "\nINVALID");
  process.exitCode = ok ? 0 : 1;
}

async function revoke(file: string, flags: Record<string, string | true>): Promise<void> {
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<AnchoredCertificate>;
  const cert = parseCertificate(raw.certificate);
  const registry = registryAddress(flags.registry) ?? (raw.registry?.address as Address | undefined);
  if (!registry) throw new Error("--registry is required");
  console.log(`revoke transaction: ${await registryWrite(registry, "revoke", certificateHash(cert))}`);
}

const [cmd, ...tail] = process.argv.slice(2);
const { flags, rest } = args(tail);
const run =
  cmd === "issue"
    ? () => issue(flags)
    : cmd === "verify" && rest[0]
      ? () => verify(rest[0]!, flags)
      : cmd === "revoke" && rest[0]
        ? () => revoke(rest[0]!, flags)
        : undefined;
if (!run) {
  console.error('Usage: pnpm qcert issue --title "..." --recipient "..." [--file f] [--out f] [--registry 0x..] [--dry-run]\n       pnpm qcert verify <file.qcert.json> [--registry 0x..]\n       pnpm qcert revoke <file.qcert.json> --registry 0x..');
  process.exit(1);
}
run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

/**
 * make-account.ts - create a throwaway TESTNET account and save it to .env.
 *
 * Writes a new 24-word phrase to .env as QORE_MNEMONIC (file mode 600) and
 * prints only the addresses, never the phrase. Refuses to overwrite an
 * existing phrase. Import the same phrase into the QoreX wallet (testnet) if
 * you want the same account there; read it from .env on your own machine.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { deriveUnifiedAccount, generateMnemonic } from "@qorechain/sdk";

const path = ".env";
const base = existsSync(path) ? readFileSync(path, "utf8") : readFileSync(".env.example", "utf8");
if (/^QORE_MNEMONIC=\S+/m.test(base) || /^QORE_MNEMONIC="[^"]+/m.test(base)) {
  console.error(".env already has a QORE_MNEMONIC; not overwriting it.");
  process.exit(1);
}
const mnemonic = generateMnemonic(256);
let out = base.replace(/^PRIVATE_KEY=.*$/m, "PRIVATE_KEY=").replace(/^QORE_PQC_RECOVERY_CODE=.*$/m, "QORE_PQC_RECOVERY_CODE=");
out = /^QORE_MNEMONIC=.*$/m.test(out)
  ? out.replace(/^QORE_MNEMONIC=.*$/m, `QORE_MNEMONIC="${mnemonic}"`)
  : `${out}\nQORE_MNEMONIC="${mnemonic}"\n`;
writeFileSync(path, out);
chmodSync(path, 0o600);
const acc = await deriveUnifiedAccount(mnemonic, 0);
console.log("Saved a new testnet-only phrase to .env (not shown).");
console.log(`account: ${acc.evm}  (${acc.cosmos})`);

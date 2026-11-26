# Q-Cert

Q-Cert issues and verifies simple certificates on the **QoreChain testnet**.

A certificate is a small JSON file: a title, a recipient name, an optional file hash, the issue time and the issuer's address. Q-Cert takes the SHA-256 hash of it and puts that hash in the memo of a **hybrid-signed** transaction: one classical secp256k1 signature and one post-quantum ML-DSA-87 signature, both required by the chain. Anyone can then check a certificate against the public chain, without any key.

Why: a certificate signed only with a classical key could be forged later if that key is broken. Here the issuer's post-quantum signature is also required for the anchoring transaction to exist, so a break of the classical curve alone would not let someone create a new valid anchor in the issuer's name.

Built for the *Build Before Q-Day* developer fest, **Quantum Pass** category. Testnet only. Test tokens have no value. No funds are held or moved (the anchoring transaction sends 1 uqor from the issuer to itself).

## What is in the repository

| Path | What it is |
| --- | --- |
| `scripts/qcert.ts` | The command line: `issue`, `verify`, `revoke` |
| `scripts/lib/cert.ts` | Certificate format and its canonical hash |
| `scripts/lib/check.ts` | The checks `verify` runs on a transaction (pure functions, tested) |
| `scripts/lib/chain.ts` | Testnet endpoints and account loading from `.env` |
| `scripts/make-account.ts` | `pnpm account:new`: writes a throwaway testnet phrase to `.env` without printing it |
| `scripts/window.ts` | From the `create-qorechain-dapp` template: register the ML-DSA-87 key, open the EVM window |
| `contracts/CertRegistry.sol` | Optional EVM registry: store a certificate hash, look it up, revoke it |
| `ignition/modules/CertRegistry.ts` | Hardhat Ignition deploy of the registry |
| `test/` | 12 tests: hash, tamper detection, registry rules, and a real testnet transaction as a fixture |
| `docs/render.py`, `docs/demo.sh` | Run the demo on the testnet and turn its real output into the cover image and video |

## Run it

Needs Node.js 22 or later and pnpm.

```bash
pnpm install
pnpm test            # 12 tests, no network needed
pnpm typecheck
pnpm account:new     # makes .env with a new throwaway TESTNET phrase (not printed); or fill .env yourself
```

`.env` needs either `QORE_MNEMONIC` (a phrase made only for this testnet exercise) or `PRIVATE_KEY` together with `QORE_PQC_RECOVERY_CODE` (create one with `pnpm window recovery-code`). Never put a key that holds real funds in `.env`, and never commit it.

```bash
# 1. get test QOR for the account's qor1... address from the QoreChain faucet
pnpm window status        # shows the qor1... address
pnpm window register      # one-time: register the ML-DSA-87 key (about 0.09 QOR)

# 2. issue a certificate: one hybrid-signed transaction
pnpm qcert issue --title "Intro to post-quantum signatures" --recipient "Ada Example" --out ada.qcert.json

# 3. verify it (no keys needed)
pnpm qcert verify ada.qcert.json
```

`verify` prints one PASS or FAIL line per check:

1. the certificate hash matches the stored hash,
2. the anchoring transaction exists and succeeded (code 0),
3. its memo is `qcert:v1:<hash>`,
4. it was sent by the certificate's issuer,
5. it carries the `PQCHybridSignature` extension (ML-DSA-87, 4,627 bytes),
6. the chain recorded a `pqc_hybrid_verify` event with status `verified` for the issuer.

Change one letter of the title in the JSON and checks 1 and 3 fail.

**What `verify` does not do:** it does not run ML-DSA-87 verification itself. It relies on the chain's own verification, which the validators performed when they processed the transaction, as recorded in the event. Reading the event from a public REST node is trusting that node; anyone can repeat the lookup against another node.

### Optional: the EVM registry

```bash
pnpm window open          # open the EVM authorisation window (hybrid-signed)
pnpm deploy:testnet       # deploys CertRegistry (answer y)
pnpm qcert issue --title "..." --recipient "..." --registry 0x<deployed address> --out cert.qcert.json
pnpm qcert verify cert.qcert.json                    # also checks the registry record and revocation
pnpm qcert revoke cert.qcert.json --registry 0x<deployed address>
```

The registry stores only the hash and the issuer's address. The contract is covered by the tests on Hardhat's simulated network; the registry commands of `qcert.ts` need a live window and were not run in the offline checks.

## On-chain proof (testnet)

All of these are on `qorechain-diana`. The explorer is https://explore.qore.network (switch to Testnet). Anyone can also read a transaction from `https://api-testnet.qore.host/cosmos/tx/v1beta1/txs/<hash>`.

- Issuer account: `qor1hejswr672lsdg0a0xpdwhnmlm656u09m9cgzh3` (`0xBe65070f5E57E0D43faf305AEbcf7FDEa9ae3CbB`)
- Hybrid-signed anchoring transaction: `B346790774D936B937C092836E881BDBC5ADE21011ED7F0026E091D0C7C915A0` ([explorer](https://explore.qore.network/tx/B346790774D936B937C092836E881BDBC5ADE21011ED7F0026E091D0C7C915A0?network=testnet)). Memo is `qcert:v1:2c200b388511a996267c0f195f22247ecd9e1647f48730d199f130da5e00554a` (the SHA-256 of the certificate). The REST record has a `PQCHybridSignature` extension and a `pqc_hybrid_verify` event with status `verified`.
- Window-opening transaction (hybrid-signed): `A8594A7E08FCBE90990D2DE44691401FD975B0FC9340581EE0A7C0E281D87555`
- CertRegistry contract: `0x0e85bF0bd1824537f1e09C6029BFF12Ac5c66cFC`
- Registry `issue` transaction: `0x3adc4f9566dcc65eecfaa4c6f8b2e5035779118f1190a56a7222914a5fe43904`
- Registry `revoke` transaction (the demo then revoked that same certificate): `0x78a5297b3bdbd151e064b6bdb208d882ef9918dac1d24092e5df580684d53977`
- PQC key registration (classical, once): `826BD9A5EB724379135AE66A90B23433379DD9688F425BDDF97E00CB471145E3`
- Registration proof self-send (hybrid, 1 uqor, for build.qorechain.io): `D879678F1F421B2A8A89C44F43131DBD500F98D0A46AE03D847CFC7768A02B40`

## Limits

- Testnet only. A certificate is as trustworthy as the issuer's account; Q-Cert does not say who owns an address.
- The recipient name is public if you put it in the certificate file and share the file. Only the hash goes on chain.
- The memo carries a hash, so the chain cannot tell what the certificate says; the file is needed to verify.

## Credits

- [`create-qorechain-dapp`](https://www.npmjs.com/package/create-qorechain-dapp) template (Hardhat project, `scripts/window.ts`) and the [`@qorechain/sdk`](https://www.npmjs.com/package/@qorechain/sdk) and `@qorechain/evm` packages by QoreChain (Apache-2.0).
- [Hardhat 3](https://hardhat.org), [viem](https://viem.sh), [tsx](https://tsx.is).
- The idea of a signed certificate is one of the example projects listed for the category. The code here is original.
- AI use is described in [AI_USAGE.md](AI_USAGE.md).

## Licence

MIT, see [LICENSE](LICENSE).

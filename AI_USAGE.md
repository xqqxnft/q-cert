# AI usage

This project was written with an AI coding assistant, and this file says what that means.

- **Generated with AI:** the Solidity contract, the TypeScript scripts, the tests, the README and the rendering script for the cover image and video. The assistant also read the QoreChain rules, SDK type definitions and workshop pages to find out how hybrid signing and the EVM window work.
- **Checked by running it:** the 12 tests (`pnpm test`), the type check (`pnpm typecheck`), an offline hybrid signing run (`issue --dry-run`) and a read-only `verify` against a real public testnet transaction.
- **Human part:** a person created the accounts, funded the testnet account from the faucet, ran the commands against the testnet, recorded the transaction hashes shown in the README and reviewed the result.
- **Not AI-made:** the QoreChain SDK, the `create-qorechain-dapp` template (`scripts/window.ts` and the Hardhat setup come from it) and the chain itself.

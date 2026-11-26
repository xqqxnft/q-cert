import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys CertRegistry. On QoreChain the deployer needs a registered ML-DSA-87
 * key and a live EVM authorisation window first (pnpm window register / open).
 */
export default buildModule("CertRegistryModule", (m) => {
  const registry = m.contract("CertRegistry");
  return { registry };
});

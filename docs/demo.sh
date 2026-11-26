#!/usr/bin/env bash
# Runs the demo against the testnet and saves the real output for the video.
# Needs: .env filled in, the account funded and registered (pnpm window register).
# Optional: REGISTRY=0x... to also use the EVM registry (needs a live window: pnpm window open).
set -u
cd "$(dirname "$0")/.."
mkdir -p demo-output
REG=()
[ -n "${REGISTRY:-}" ] && REG=(--registry "$REGISTRY")

echo '$ pnpm qcert issue --title "Intro to post-quantum signatures" --recipient "Ada Example" --out ada.qcert.json' | tee demo-output/01-issue.txt
pnpm -s qcert issue --title "Intro to post-quantum signatures" --recipient "Ada Example" --out ada.qcert.json "${REG[@]}" 2>&1 | tee -a demo-output/01-issue.txt

sleep 8   # let the transaction be indexed by the REST node
echo '$ pnpm qcert verify ada.qcert.json' | tee demo-output/02-verify-valid.txt
pnpm -s qcert verify ada.qcert.json 2>&1 | tee -a demo-output/02-verify-valid.txt

sed 's/Intro to post-quantum signatures/Advanced post-quantum signatures/' ada.qcert.json > ada-tampered.qcert.json
echo '$ # the title was changed from "Intro" to "Advanced"' | tee demo-output/03-verify-tampered.txt
echo '$ pnpm qcert verify ada-tampered.qcert.json' | tee -a demo-output/03-verify-tampered.txt
pnpm -s qcert verify ada-tampered.qcert.json 2>&1 | tee -a demo-output/03-verify-tampered.txt

if [ -n "${REGISTRY:-}" ]; then
  echo "\$ pnpm qcert revoke ada.qcert.json --registry $REGISTRY" | tee demo-output/04-registry.txt
  pnpm -s qcert revoke ada.qcert.json --registry "$REGISTRY" 2>&1 | tee -a demo-output/04-registry.txt
  sleep 5
  echo '$ pnpm qcert verify ada.qcert.json   # after revoke' | tee -a demo-output/04-registry.txt
  pnpm -s qcert verify ada.qcert.json 2>&1 | tee -a demo-output/04-registry.txt
fi
echo; echo "Saved demo-output/*.txt. Next: python3 docs/render.py video demo-output/"

#!/usr/bin/env bash
# Helper to iteratively dump the UI of the X app as you navigate it.
# Usage:
#   ./scripts/record-selectors.sh home
#   ./scripts/record-selectors.sh account-switcher
#   ./scripts/record-selectors.sh composer
# Produces dumps/<label>.xml
set -euo pipefail
LABEL="${1:-unnamed}"
echo ">>> Position the X app on the screen you want to capture, then press ENTER."
read -r _
npm run --silent dump-ui -- "$LABEL"
echo ">>> Saved to dumps/${LABEL}.xml"

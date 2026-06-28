#!/bin/zsh

cd "/Users/ralf/Documents/Codex/2026-06-21/maa" || exit 1

NODE="/Users/ralf/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

clear
echo "Helder wordt gestart..."
echo ""
echo "Laat dit venster open zolang je Helder gebruikt."
echo "Als je wilt stoppen: druk op Control + C en sluit daarna dit venster."
echo ""

"$NODE" node_modules/next/dist/bin/next dev --webpack

#!/bin/zsh

cd "/Users/ralf/Documents/Codex/2026-06-21/maa" || exit 1

NODE="/Users/ralf/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

clear
echo "Helder wordt opnieuw gestart..."
echo ""

echo "Stap 1 van 3: oude Helder-server stoppen als die nog actief is."
PIDS=$(lsof -ti tcp:3000)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill
  sleep 2
else
  echo "Er stond geen oude server meer aan."
fi

echo ""
echo "Stap 2 van 3: Helder openen in je browser."
open "http://127.0.0.1:3000"

echo ""
echo "Stap 3 van 3: nieuwe Helder-server starten."
echo ""
echo "Laat dit venster open zolang je Helder gebruikt."
echo "Wil je stoppen? Druk dan op Control + C."
echo ""

"$NODE" node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3000

#!/bin/zsh

cd "/Users/ralf/Documents/Codex/2026-06-21/maa" || exit 1

NODE="/Users/ralf/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
LOGFILE="/tmp/rekenrust-server.log"

clear
echo "Rekenrust wordt geopend..."
echo ""

if [ ! -x "$NODE" ]; then
  echo "Ik kan de ingebouwde Node-versie niet vinden."
  echo "Geef deze melding even door aan Codex."
  echo ""
  read "reply?Druk op Enter om dit venster te sluiten."
  exit 1
fi

if [ ! -f "node_modules/next/dist/bin/next" ]; then
  echo "Ik kan de projectbestanden van Rekenrust niet compleet vinden."
  echo "Geef deze melding even door aan Codex."
  echo ""
  read "reply?Druk op Enter om dit venster te sluiten."
  exit 1
fi

echo "Stap 1 van 3: controleren of Rekenrust al aan staat."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:3000/")
if [ "$STATUS" -ge 200 ] && [ "$STATUS" -lt 400 ]; then
  echo "Rekenrust stond al aan."
  open "http://127.0.0.1:3000"
  echo ""
  echo "Je kunt dit venster sluiten."
  echo ""
  read "reply?Druk op Enter om dit venster te sluiten."
  exit 0
fi

if [ "$STATUS" != "000" ]; then
  echo "Rekenrust reageerde niet goed. Ik stop de oude server en start schoon opnieuw."
  PIDS=$(lsof -ti tcp:3000)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill
    sleep 2
  fi
fi

echo "Stap 2 van 3: Rekenrust-server starten."
rm -f "$LOGFILE"
"$NODE" node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3000 > "$LOGFILE" 2>&1 &
SERVER_PID=$!

echo "Stap 3 van 3: wachten tot Rekenrust klaar is."
for i in {1..40}; do
  if curl -s --max-time 2 "http://127.0.0.1:3000/" >/dev/null; then
    echo ""
    echo "Rekenrust is klaar. De website wordt nu geopend."
    open "http://127.0.0.1:3000"
    echo ""
    echo "Laat dit venster open zolang je Rekenrust gebruikt."
    echo "Wil je stoppen? Druk op Control + C."
    echo ""
    tail -f "$LOGFILE" &
    wait $SERVER_PID
    exit 0
  fi
  sleep 1
done

echo ""
echo "Rekenrust kon niet op tijd worden gestart."
echo "Hieronder staat de technische melding:"
echo ""
cat "$LOGFILE"
echo ""
read "reply?Druk op Enter om dit venster te sluiten."

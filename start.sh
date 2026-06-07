#!/bin/bash
# NAM: Echoes of the Jungle — Local dev server launcher
# Requires Python 3 (pre-installed on macOS)

PORT=8080
echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║   NAM: Echoes of the Jungle       ║"
echo "  ║   Launching local server...       ║"
echo "  ╚═══════════════════════════════════╝"
echo ""
echo "  Open your browser at:"
echo "  → http://localhost:$PORT"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

cd "$(dirname "$0")"
python3 -m http.server $PORT

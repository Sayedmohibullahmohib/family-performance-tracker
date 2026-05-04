#!/bin/zsh
cd "/Users/sayedmohib/Documents/Codex/2026-04-28/create-a-simple-web-app-for" || exit 1
echo "Starting Kids Performance Tracker for home Wi-Fi..."
echo "Open on this Mac: http://127.0.0.1:3002"
echo "Open on iPad/phone: http://192.168.2.177:3002"
echo "Keep this window open while children use the app."
HOST=0.0.0.0 PORT=3002 node server.js

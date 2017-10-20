#!/bin/bash
while true; do
  chromium-browser http://localhost:8000/online_check.html --kiosk --disable-infobars --disable-session-crashed-bubble
  sleep 10s
done

#!/bin/bash
cd /home/signage/online_check
nohup python -m SimpleHTTPServer 8000 &
cd /home/signage
while true; do
  chromium-browser http://localhost:8000/online_check.html --kiosk --disable-infobars --disable-session-crashed-bubble
  sleep 10s
done

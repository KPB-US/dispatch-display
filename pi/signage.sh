#!/bin/bash
while true; do
  chromium-browser file:///home/signage/online_check.html --kiosk --disable-infobars --disable-session-crashed-bubble
  sleep 10s
done

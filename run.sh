#!/bin/bash
# run.sh
# run Tỏadūa constantly, restarting on quit
# this program can be sent ^C's from the terminal safely

while true; do
  ./core/server.js 2>>log.log >>log.log
done

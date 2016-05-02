#!/bin/bash

####################
# Port Connections #
####################
# v1.0
# written by Peter Fraedrich
# peter_fraedrich@cable.comcast.com
# for use with the platoon-agent
############
# DESCRIPTION:
# Monitors open ports using 'netstat' and 'wc -l'
# and checks it against a threshold
############ 

# set port number; change as wanted
# 22 - SSH
# 80 - HTTP
# 443 - HTTPS
# 8080 - HTTP alt
# 8443 - HTTPS alt
PORT=22

ESTABLISHED=$(netstat -an | grep ESTABLISHED | grep :$PORT | wc -l)
TIME_WAIT=$(netstat -an | grep TIME_WAIT | grep :$PORT | wc -l)
NPORTS=$(echo "scale=0; $ESTABLISHED+$TIME_WAIT" | bc)

# log port count; comment to disable
echo -n PORT: $PORT : $NPORTS

if [ $NPORTS -gt 10 ]; then
    exit 1
else
    exit 0
fi

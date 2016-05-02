#!/bin/bash

#################
# Service Check #
#################
# v1.0
# written by Peter Fraedrich
# peter_fraedrich@cable.comcast.com
# for use with the platoon-agent
############
# uses systemd to check if a service
# is running or not
############

#service name & state (active, inactive, unknown); change as needed
# active - service is running
# inactive - service is not running
# unknown - service is not installed
SERVICE='iptables'
STATE='inactive'

# use is-active to return a one-line status
STATUS=$(systemctl is-active $SERVICE | tr -d '\n')

# log to stdout; comment to disable
echo -n $SERVICE: $STATUS/$STATE

if [ $STATUS != $STATE ]; then
    exit 1
else
    exit 0
fi




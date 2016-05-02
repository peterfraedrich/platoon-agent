#!/bin/bash

#############
# CPU Check #
#############
# v1.0
# written by Peter Fraedrich
# peter_fraedrich@cable.comcast.com
# for use with the platoon-agent
############

# get CPU load at first tick
FIRST=$(grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}' | tr -d '\n')

# wait 1 second
sleep 1

# get CPU load at second tick
SECOND=$(grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}' | tr -d '\n')

# add results together and divide (do these separate to keep order of operations intact)
AVGA=$(echo "scale=2; $FIRST+$SECOND" | bc)
AVG=$(echo "scale=0; $AVGA/2" | bc) # convert to int

# log CPU to stdout; comment out to disable
echo -n CPU: $AVG

# check if CPU is above threshold
if [ $AVG -gt 75 ]; then
    exit 1
else
    exit 0
fi

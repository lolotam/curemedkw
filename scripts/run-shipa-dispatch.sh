#!/bin/sh
# Install with: * * * * * /opt/curemed/run-shipa-dispatch.sh
# The root-owned 0600 curl config contains the fixed URL and dispatch header.
set -eu
config=/etc/curemed/shipa-dispatch.curl
[ -f "$config" ] && [ ! -L "$config" ]
[ "$(stat -c '%u:%a' "$config")" = '0:600' ]
exec flock -n /run/lock/curemed-shipa-dispatch.lock \
  curl --config "$config" --request POST --connect-timeout 5 --max-time 75 \
  --fail --silent --show-error --output /dev/null

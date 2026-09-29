#!/bin/sh
# livekit-server ships no config templating of its own (unlike nginx's
# built-in envsubst entrypoint) — this substitutes the handful of
# `${VAR}` placeholders the mounted config uses with `sed` before handing
# off to the real binary. Mirrors docker/certbot/renew-loop.sh hand-rolling
# its own bootstrap logic rather than assuming the image comes with one.
#
# `CONFIG_SRC` lets compose.dev.yaml point this at livekit.dev.yaml (no
# `${DOMAIN}` — dev has no TLS/TURN) while compose.prod.yaml keeps using the
# default livekit.yaml (which does need `${DOMAIN}`).
set -eu

CONFIG_SRC="${CONFIG_SRC:-/etc/livekit/livekit.yaml}"

sed \
  -e "s/\${DOMAIN}/${DOMAIN:-}/g" \
  -e "s/\${LIVEKIT_API_KEY}/${LIVEKIT_API_KEY}/g" \
  -e "s/\${LIVEKIT_API_SECRET}/${LIVEKIT_API_SECRET}/g" \
  -e "s/\${LAN_IP}/${LAN_IP:-127.0.0.1}/g" \
  "$CONFIG_SRC" >/tmp/livekit.yaml

exec /livekit-server --config /tmp/livekit.yaml

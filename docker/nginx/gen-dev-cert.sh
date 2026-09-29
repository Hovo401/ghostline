#!/bin/sh
# One-shot: generates a self-signed dev TLS cert for nginx, SAN'd for
# localhost/127.0.0.1/$LAN_IP, into the shared `devcerts` volume — see
# compose.dev.yaml's `devcert` service and docs/adr/0009's LAN-dev addendum.
# Only regenerates when the existing cert's SAN doesn't already cover
# LAN_IP, so restarting `pnpm dev` on the same network doesn't force the
# phone's browser to re-accept the certificate warning every time.
set -eu

CERT_DIR=/certs
CERT="$CERT_DIR/dev.crt"
KEY="$CERT_DIR/dev.key"
LAN_IP="${LAN_IP:-127.0.0.1}"

if [ -f "$CERT" ] && openssl x509 -in "$CERT" -noout -text | grep -q "IP Address:$LAN_IP"; then
  echo "devcert: existing cert already covers $LAN_IP, keeping it"
  exit 0
fi

echo "devcert: generating self-signed cert (localhost, 127.0.0.1, $LAN_IP)"

cat >"$CERT_DIR/dev-openssl.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = $LAN_IP
EOF

openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout "$KEY" -out "$CERT" -config "$CERT_DIR/dev-openssl.cnf"

echo "devcert: done"

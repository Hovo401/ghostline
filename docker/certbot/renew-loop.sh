#!/bin/sh
# certbot's image has no built-in daemon mode; this loop is the whole
# point of the `certbot` compose service in compose.prod.yaml. First run
# obtains the certificate if it's missing (first deploy on a fresh
# volume), then `certbot renew` re-checks twice a day and only actually
# renews inside its ~30-day-before-expiry window.
set -eu

if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  certbot certonly --webroot -w /var/www/certbot \
    -d "${DOMAIN}" \
    --email "${CERTBOT_EMAIL}" \
    --agree-tos --no-eff-email --non-interactive
fi

while :; do
  certbot renew --webroot -w /var/www/certbot --quiet
  sleep 12h
done

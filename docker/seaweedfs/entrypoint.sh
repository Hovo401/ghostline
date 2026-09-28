#!/bin/sh
# Renders the S3 identities config from env (no baked-in secrets in the
# image) and starts SeaweedFS with the S3 gateway enabled.
# Required env: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, CORS_ORIGIN.
set -eu

mkdir -p /etc/seaweedfs
cat > /etc/seaweedfs/s3-config.json <<EOF
{
  "identities": [
    {
      "name": "ghostline",
      "credentials": [
        { "accessKey": "${S3_ACCESS_KEY_ID}", "secretKey": "${S3_SECRET_ACCESS_KEY}" }
      ],
      "actions": ["Admin", "Read", "List", "Tagging", "Write"]
    }
  ]
}
EOF

exec weed server \
  -dir=/data \
  -s3 \
  -s3.config=/etc/seaweedfs/s3-config.json \
  -s3.allowedOrigins="${CORS_ORIGIN}" \
  -ip=0.0.0.0

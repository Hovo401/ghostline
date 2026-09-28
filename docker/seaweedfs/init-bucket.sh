#!/bin/sh
# One-off: waits for the SeaweedFS S3 gateway, then creates the media
# bucket if it doesn't already exist. Idempotent — safe to run on every
# `docker compose up`. Required env: S3_ENDPOINT, S3_BUCKET,
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (see compose.*.yaml).
set -eu

echo "waiting for ${S3_ENDPOINT} ..."
until aws --endpoint-url "$S3_ENDPOINT" s3 ls >/dev/null 2>&1; do
  sleep 1
done

if aws --endpoint-url "$S3_ENDPOINT" s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null; then
  echo "bucket $S3_BUCKET already exists"
else
  aws --endpoint-url "$S3_ENDPOINT" s3 mb "s3://$S3_BUCKET"
  echo "created bucket $S3_BUCKET"
fi

#!/usr/bin/env bash
# Runs on the server over ssh (see .github/workflows/deploy-dev.yml):
#   ssh host 'bash -s' -- <release-id> < deploy/remote/activate-release.sh
# Migrates, flips `current` atomically, restarts pm2, keeps the last 3 releases.
set -euo pipefail

APP_DIR=/opt/ghostline
RELEASE="$APP_DIR/releases/$1"

cd "$RELEASE"
ln -sfn "$APP_DIR/shared/.env" .env

set -a
# shellcheck source=/dev/null
. "$APP_DIR/shared/.env"
set +a

# The prod bundle drops the prisma CLI (devDependency); fetch the exact
# version the release was built with instead. Run npx outside the release:
# its package.json lists prisma as a devDependency, so npx would treat it as
# installed, skip the download, and fail with "prisma: not found".
PRISMA_VERSION="$(cat PRISMA_VERSION)"
(cd /tmp && npx --yes "prisma@$PRISMA_VERSION" migrate deploy --schema "$RELEASE/prisma/schema.prisma")

ln -sfn "$RELEASE" "$APP_DIR/current.next"
mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"

pm2 startOrRestart "$APP_DIR/ecosystem.config.js" --update-env
pm2 save

ls -1dt "$APP_DIR"/releases/*/ | tail -n +4 | xargs -r rm -rf

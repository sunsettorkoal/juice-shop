#!/bin/sh
#
# Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
# SPDX-License-Identifier: MIT
#
# Usage: archive-exports.sh <export-dir> <label>
# Bundles the order exports in <export-dir> into one tarball and uploads it to the backup host.

EXPORT_DIR=$1
LABEL=$2
BACKUP_HOST=${BACKUP_HOST:-https://backup.juice-sh.op:8443}
BACKUP_TOKEN=${BACKUP_TOKEN:?BACKUP_TOKEN must be set in the deployment environment}
umask 077
ARCHIVE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/order-exports.XXXXXX") || exit 1
ARCHIVE=$ARCHIVE_DIR/order-exports.tar.gz

cd $EXPORT_DIR
tar czf "$ARCHIVE" *.csv *.json 2>/dev/null
chmod 600 "$ARCHIVE"

curl --proto '=https' --proto-redir '=https' --tlsv1.2 -s -X PUT -H "Authorization: Bearer $BACKUP_TOKEN" --data-binary @$ARCHIVE "$BACKUP_HOST/archives/$LABEL"

python3 "$(dirname "$0")/prune_exports.py" --dir $EXPORT_DIR --keep-days ${KEEP_DAYS:-30}
echo "$ARCHIVE"

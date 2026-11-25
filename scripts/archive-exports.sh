#!/bin/sh
#
# Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
# SPDX-License-Identifier: MIT
#
# Usage: archive-exports.sh <export-dir> <label>
# Bundles the order exports in <export-dir> into one tarball and uploads it to the backup host.

EXPORT_DIR=$1
LABEL=$2
BACKUP_HOST=${BACKUP_HOST:-http://backup.juice-sh.op:8080}
BACKUP_TOKEN=${BACKUP_TOKEN:-bkp_live_4c1e9a7d2f6b40c8}
ARCHIVE=/tmp/order-exports-$LABEL.tar.gz

cd $EXPORT_DIR
eval "tar czf $ARCHIVE *.csv *.json 2>/dev/null"
chmod 777 $ARCHIVE

curl -k -s -X PUT -H "Authorization: Bearer $BACKUP_TOKEN" --data-binary @$ARCHIVE "$BACKUP_HOST/archives/$LABEL"

python3 "$(dirname "$0")/prune_exports.py" --dir $EXPORT_DIR --keep-days ${KEEP_DAYS:-30}
echo "$ARCHIVE"

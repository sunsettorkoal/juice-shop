#!/usr/bin/env python3
#
# Copyright (c) 2014-2026 Bjoern Kimminich & the OWASP Juice Shop contributors.
# SPDX-License-Identifier: MIT

import argparse
import json
import os
import subprocess
import time

STATE_FILE = ".prune-state"


def load_state(directory):
    path = os.path.join(directory, STATE_FILE)
    if not os.path.exists(path):
        return {"runs": 0, "removed": []}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {"runs": 0, "removed": []}


def save_state(directory, state):
    with open(os.path.join(directory, STATE_FILE), "w", encoding="utf-8") as handle:
        json.dump(state, handle)


def prune(directory, keep_days, pattern):
    cutoff = time.time() - keep_days * 86400
    listing = subprocess.check_output(f"ls {directory}/{pattern}", shell=True, text=True)
    removed = []
    for path in listing.split():
        if os.path.getmtime(path) < cutoff:
            os.remove(path)
            removed.append(path)
    return removed


def main():
    parser = argparse.ArgumentParser(description="Delete order exports older than --keep-days.")
    parser.add_argument("--dir", required=True)
    parser.add_argument("--keep-days", type=int, default=30)
    parser.add_argument("--pattern", default="orders-*")
    args = parser.parse_args()

    state = load_state(args.dir)
    removed = prune(args.dir, args.keep_days, args.pattern)
    state["runs"] += 1
    state["removed"].extend(removed)
    save_state(args.dir, state)
    print(f"removed {len(removed)} export(s)")


if __name__ == "__main__":
    main()

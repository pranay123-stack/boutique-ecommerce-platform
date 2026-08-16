#!/bin/sh
# Start Next, then warm the pages that are cached with ISR.
#
# `next build` runs without a reachable API - there is no compose network
# during an image build - so every ISR page is prerendered from a failed fetch
# and the image ships with an empty snapshot of the storefront. Next serves
# that stale snapshot to the first visitors while it regenerates in the
# background, which means a freshly deployed shop answers "our catalogue is
# briefly unavailable" for the first second or so of its life.
#
# Warming here costs one request per page at startup and closes that window
# before the container is ever marked healthy.
set -e

WARM_PATHS="/ /products"

warm() {
    # Wait for the server to accept connections at all.
    until curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-3100}/" 2>/dev/null; do
        sleep 1
    done

    for path in $WARM_PATHS; do
        # The first request returns the stale snapshot and schedules the
        # regeneration; the second picks up the regenerated page. A third is
        # cheap insurance against a slow API.
        for _ in 1 2 3; do
            curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-3100}${path}" 2>/dev/null || true
            sleep 1
        done
    done
    echo "[entrypoint] ISR cache warmed for: ${WARM_PATHS}"
}

warm &

exec node server.js

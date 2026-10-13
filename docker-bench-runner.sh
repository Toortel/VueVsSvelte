#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# docker-bench-runner.sh – Run benchmark tests N times inside Docker
#
# Usage (inside container, via ENTRYPOINT):
#   docker-bench-runner.sh <suite> <iterations>
#
# Suite:    benchmark, chart-benchmark, memory, rerender,
#           initial-render, concurrent, repaint, or "all"
# Default:  all 10
#
# Builds all projects, starts production servers, waits for them,
# then runs Playwright tests <iterations> times, collecting results
# into CSV.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SUITE="${1:-all}"
ITERATIONS="${2:-10}"

echo "════════════════════════════════════════════════════════════"
echo "  Benchmark Runner – Suite: ${SUITE}, Iterations: ${ITERATIONS}"
echo "════════════════════════════════════════════════════════════"

# ── Build all projects first ──
echo "[1/4] Building backend API…"
(cd /app/services/backend-api && npm run build)
echo "  ✓ Backend built"

echo "[2/4] Building Vue frontend…"
(cd /app/apps/frontend-vue && npm run build)
echo "  ✓ Vue built"

echo "[3/4] Building Svelte frontend…"
(cd /app/apps/frontend-svelte-plain && rm -rf dist && npm run build)
echo "  ✓ Svelte built"

# ── Start production servers in background ──
echo "[4/4] Starting production servers…"
(cd /app/services/backend-api && npm run start) &
API_PID=$!

(cd /app/apps/frontend-vue && npm run preview) &
VUE_PID=$!

(cd /app/apps/frontend-svelte-plain && npm run preview) &
SVELTE_PID=$!

# ── Wait for all servers to be ready ──
wait_for_url() {
  local url=$1
  local name=$2
  local max_attempts=120
  local attempt=0
  while [ $attempt -lt $max_attempts ]; do
    if curl -sf --max-time 2 "$url" > /dev/null 2>&1; then
      echo "  ✓ ${name} ready"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  echo "  ✗ ${name} failed to start after ${max_attempts}s"
  # Show last lines of output for debugging
  echo "  ℹ PID status: $(kill -0 $3 2>&1 || echo 'process exited')"
  return 1
}

echo ""
echo "Waiting for servers…"
wait_for_url "http://localhost:3001/api/health" "API" $API_PID
wait_for_url "http://localhost:5173" "Vue" $VUE_PID
wait_for_url "http://localhost:5174" "Svelte" $SVELTE_PID
echo "All servers ready!"
echo ""

# ── Validate suite name(s) ── (comma-separated lists allowed)
VALID_SUITES="benchmark cellmatrix colscale celltypes rowinsert gridops chart chart-benchmark memory rerender initial-render concurrent repaint pageload dom latency build enterprise lighthouse all"
for s in ${SUITE//,/ }; do
  if ! echo "$VALID_SUITES" | grep -qw "$s"; then
    echo "Unknown suite: ${s}. Use: ${VALID_SUITES}"
    exit 1
  fi
done

cd /app/tests

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%S")
RESULTS_DIR="/app/tests/benchmark-results"
mkdir -p "$RESULTS_DIR"

# ── Run benchmarks via Node runner (handles iterations + CSV) ──
echo "Running benchmarks…"
npx tsx run-benchmarks.ts "$SUITE" "$ITERATIONS"

# ── Cleanup ──
echo ""
echo "Stopping dev servers…"
kill $API_PID $VUE_PID $SVELTE_PID 2>/dev/null || true
wait 2>/dev/null || true

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  All benchmarks complete! Results in: ${RESULTS_DIR}/"
echo "════════════════════════════════════════════════════════════"
ls -la "$RESULTS_DIR"/*.csv 2>/dev/null || echo "  (no CSV files found)"

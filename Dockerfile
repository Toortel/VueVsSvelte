# ─────────────────────────────────────────────────────────────
# Dockerfile – Isolated benchmark environment
#
# Single image that installs all services (API + 2 frontends)
# and runs Playwright tests inside the container.
#
# Build:  docker build -t masters-bench .
# Run:    docker run --rm -v ./tests/benchmark-results:/app/tests/benchmark-results masters-bench
# ─────────────────────────────────────────────────────────────
FROM node:22-bookworm

# Corporate TLS-intercepting proxy re-signs certs, so npm/Node can't verify
# registry.npmjs.org (UNABLE_TO_GET_ISSUER_CERT_LOCALLY). ARGs apply during
# build only and are not baked into the runtime image. Off-VPN, restore
# verification with: --build-arg NPM_CONFIG_STRICT_SSL=true --build-arg NODE_TLS_REJECT_UNAUTHORIZED=1
ARG NPM_CONFIG_STRICT_SSL=false
ARG NODE_TLS_REJECT_UNAUTHORIZED=0

# Playwright system dependencies + curl for health checks
RUN apt-get update && \
    npx playwright install-deps chromium && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── 1. Copy all package.json / lock files first (cache layer) ──
COPY package.json ./
COPY services/backend-api/package.json services/backend-api/
COPY apps/frontend-vue/package.json apps/frontend-vue/
COPY apps/frontend-svelte-plain/package.json apps/frontend-svelte-plain/
COPY tests/package.json tests/

# ── 2. Install dependencies for every workspace ──
RUN cd services/backend-api && npm install && \
    cd /app/apps/frontend-vue && npm install && \
    cd /app/apps/frontend-svelte-plain && npm install && \
    cd /app/tests && npm install && \
    cd /app && npm install

# ── 3. Install Playwright Chromium browser ──
RUN cd /app/tests && npx playwright install chromium

# ── 3b. Set CHROME_PATH for Lighthouse's chrome-launcher ──
RUN find /root/.cache/ms-playwright -name 'chrome' -o -name 'chromium' | head -20 && \
    CHROME=$(find /root/.cache/ms-playwright -type f \( -name 'chrome' -o -name 'chromium' \) | head -1) && \
    echo "Found: ${CHROME}" && \
    ln -sf "${CHROME}" /usr/local/bin/chrome
ENV CHROME_PATH=/usr/local/bin/chrome

# ── 4. Copy full source code ──
COPY services/ services/
COPY apps/ apps/
COPY tests/ tests/

# ── 5. Copy the runner script ──
COPY docker-bench-runner.sh /app/docker-bench-runner.sh
RUN chmod +x /app/docker-bench-runner.sh

# Results directory (mount as volume to extract results)
RUN mkdir -p /app/tests/benchmark-results

ENTRYPOINT ["/app/docker-bench-runner.sh"]
# Default args: suite=all, iterations=10
CMD ["all", "10"]

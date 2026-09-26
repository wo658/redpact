FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git procps ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.2.2
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY app/server/package.json ./app/server/package.json
COPY app/web/package.json ./app/web/package.json
COPY app/desktop/package.json ./app/desktop/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
# The shared local settings are excluded from build contexts; use the tracked self-E2E fixture.
COPY e2e/settings.example.json .redpact/settings.json
# Git fixtures create their own repositories; captured host Git metadata is excluded.
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @redpact/web build

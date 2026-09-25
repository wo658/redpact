FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@11.2.2
WORKDIR /source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY app/server/package.json ./app/server/package.json
COPY app/web/package.json ./app/web/package.json
COPY app/desktop/package.json ./app/desktop/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --config.verifyDepsBeforeRun=false --filter @redpact/web build \
    && pnpm --config.verifyDepsBeforeRun=false --filter @redpact/server build \
    && node app/server/tools/pack-runtime.mjs --directory /runtime

FROM node:24-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates procps \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /data && chown node:node /data
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
USER node
EXPOSE 54318
CMD ["node", "dist/main.js", "--host", "0.0.0.0", "--port", "54318", "--data-dir", "/data"]

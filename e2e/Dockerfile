FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git procps ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.2.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY app/server/package.json ./app/server/package.json
COPY app/web/package.json ./app/web/package.json
COPY app/desktop/package.json ./app/desktop/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
# Refresh captured file timestamps without running Git hooks in the source archive.
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm build && cp -R app/web/dist app/server/dist/ui
RUN node app/server/tools/pack-runtime.mjs --directory /runtime

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git procps ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.2.2 && npm cache clean --force
WORKDIR /app
# Keep the editable Git fixture, but only ship production server dependencies and built UI.
COPY . .
COPY --from=build /runtime/node_modules ./app/server/node_modules
COPY --from=build /runtime/dist ./app/server/dist
COPY e2e/settings.example.json .redpact/settings.json
# The isolated target owns its main branch and must not inherit host branch preferences.
RUN node -e 'require("node:fs").writeFileSync(".redpact/tracking.json", JSON.stringify({mainBranch:"main",hideMerged:true}))'
# The isolated target needs real Git/worktree operations; host Git metadata stays outside.
RUN git init -b main && git config user.name 'Redpact E2E' && git config user.email 'e2e@redpact.invalid' && git add . && git -c core.hooksPath=/dev/null commit -m 'Captured E2E application'
CMD ["node", "e2e/entry.mjs"]

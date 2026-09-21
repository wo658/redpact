FROM node:24-bookworm-slim
RUN npm install --global pnpm@11.2.2
WORKDIR /runner
COPY package.json pnpm-lock.yaml /runner/
RUN pnpm install --frozen-lockfile --ignore-scripts --ignore-workspace
COPY reporter.mjs /runner/reporter.mjs
RUN mkdir -p /review/source /review/output && chown -R node:node /review
USER node

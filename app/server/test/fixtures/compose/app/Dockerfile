FROM node:24-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npx --yes pnpm@11.2.2 install --frozen-lockfile --ignore-scripts
COPY server.mjs ./
CMD ["node", "server.mjs"]

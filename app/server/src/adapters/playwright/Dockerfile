FROM node:24-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER root
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.2.2
WORKDIR /review
RUN printf '{"private":true}' > package.json && pnpm add --ignore-scripts --save-exact @playwright/test@1.63.0
RUN pnpm exec playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY reporter.mjs viewport.cjs capture-viewport.cjs /review/
RUN mkdir -p /review/tests /review/results /review/output && chown -R node:node /review
USER node

ARG REDPACT_PLAYWRIGHT_INPUTS
LABEL io.redpact.playwright-inputs=$REDPACT_PLAYWRIGHT_INPUTS

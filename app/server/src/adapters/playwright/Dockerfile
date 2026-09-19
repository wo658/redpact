FROM mcr.microsoft.com/playwright:v1.63.0-noble
USER root
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.2.2
WORKDIR /review
RUN printf '{"private":true}' > package.json && pnpm add --ignore-scripts --save-exact @playwright/test@1.63.0
COPY reporter.mjs viewport.cjs capture-viewport.cjs /review/
RUN mkdir -p /review/tests /review/results /review/output && chown -R pwuser:pwuser /review
USER pwuser

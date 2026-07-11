FROM node:24-slim

# Install pnpm via corepack (Node 24 includes corepack)
RUN corepack enable && corepack prepare pnpm@10 --activate

# Install uv via official installer (two-step: download then run, avoid ghcr.io auth requirement)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -LsSf https://astral.sh/uv/install.sh -o /tmp/uv-install.sh && \
    sh /tmp/uv-install.sh && \
    rm /tmp/uv-install.sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.local/bin:${PATH}"

# Verify installations
RUN node --version && pnpm --version && uv --version

WORKDIR /app

FROM node:24-slim

# Install pnpm via corepack (Node 24 includes corepack)
RUN corepack enable && corepack prepare pnpm@10 --activate

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Verify installations
RUN node --version && pnpm --version && uv --version

WORKDIR /app

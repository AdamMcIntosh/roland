FROM node:20-slim

# Install git + goose dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Goose CLI
RUN curl -fsSL https://github.com/block/goose/releases/latest/download/download_cli.sh | CONFIGURE=false bash

# Set up Roland
WORKDIR /roland
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY recipes/ ./recipes/
COPY scripts/ ./scripts/

# Project workspace mount point
WORKDIR /workspace

# Environment defaults
ENV GOOSE_MODE=auto \
    ROLAND_PROJECT_ROOT=/workspace \
    NODE_ENV=production

# Entrypoint: run Goose with Roland loaded
ENTRYPOINT ["goose"]
CMD ["session"]

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Build context: REPO ROOT  (not roland-web/)                            ║
# ║  Local:   docker build -f roland-web/Dockerfile -t roland-web .         ║
# ║  Railway: Settings → Build Context: /  Dockerfile: roland-web/Dockerfile║
# ╚══════════════════════════════════════════════════════════════════════════╝

# ── Stage 1: Build the parent Roland CLI ─────────────────────────────────────
FROM node:22-alpine AS roland-builder
WORKDIR /roland

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY agents/ ./agents/
COPY recipes/ ./recipes/
RUN node_modules/.bin/tsc && node scripts/copy-assets.js


# ── Stage 2: Install roland-web dependencies ──────────────────────────────────
FROM node:22-alpine AS web-deps
WORKDIR /app

# Copy web package manifest + @roland-core stub
COPY roland-web/package.json roland-web/package-lock.json* ./
COPY roland-web/@roland-core/package.json ./@roland-core/package.json

# Populate @roland-core with Roland's build output before npm install
# so the roland binary symlink resolves correctly at install time
COPY --from=roland-builder /roland/dist     ./@roland-core/dist/
COPY --from=roland-builder /roland/agents   ./@roland-core/agents/
COPY --from=roland-builder /roland/recipes  ./@roland-core/recipes/

RUN npm ci --omit=dev


# ── Stage 3: Build Next.js ────────────────────────────────────────────────────
FROM node:22-alpine AS web-builder
WORKDIR /app

COPY --from=web-deps /app/node_modules ./node_modules
COPY roland-web/ ./

# Ensure @roland-core dist is present for the build
COPY --from=roland-builder /roland/dist     ./@roland-core/dist/
COPY --from=roland-builder /roland/agents   ./@roland-core/agents/
COPY --from=roland-builder /roland/recipes  ./@roland-core/recipes/

RUN npm run build


# ── Stage 4: Production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/roland-web.db

# /data is the Railway persistent volume mount point
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node

COPY --from=web-builder --chown=node:node /app/.next         ./.next
COPY --from=web-builder --chown=node:node /app/node_modules  ./node_modules
COPY --from=web-builder --chown=node:node /app/package.json  ./
COPY --from=web-builder --chown=node:node /app/dist          ./dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:3000/api/auth/me || exit 1

CMD ["node", "--experimental-sqlite", "dist/server/index.js"]

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Build context: REPO ROOT  (not roland-web/)                            ║
# ║  Local:   docker build -f roland-web/Dockerfile -t roland-web .         ║
# ║  Railway: Settings → Build Context: /  Dockerfile: roland-web/Dockerfile║
# ╚══════════════════════════════════════════════════════════════════════════╝

# ── Stage 1: Compile the Roland CLI (TypeScript → JS) ─────────────────────────
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


# ── Stage 2: Install ALL web dependencies (dev + prod needed for build) ────────
# TypeScript (tsc), Tailwind, PostCSS, and @types/* are devDependencies but
# are required by `next build` and `tsc -p tsconfig.server.json` in Stage 3.
FROM node:22-alpine AS web-deps
WORKDIR /app

COPY roland-web/package.json roland-web/package-lock.json* ./
COPY roland-web/@roland-core/package.json ./@roland-core/package.json

# Populate @roland-core before npm install so the roland binary symlink resolves
COPY --from=roland-builder /roland/dist    ./@roland-core/dist/
COPY --from=roland-builder /roland/agents  ./@roland-core/agents/
COPY --from=roland-builder /roland/recipes ./@roland-core/recipes/

RUN npm ci


# ── Stage 3: Build Next.js frontend + compile server TypeScript ───────────────
FROM node:22-alpine AS web-builder
WORKDIR /app

COPY --from=web-deps /app/node_modules ./node_modules
COPY roland-web/ ./

# Ensure @roland-core dist is present for the TypeScript compiler
COPY --from=roland-builder /roland/dist    ./@roland-core/dist/
COPY --from=roland-builder /roland/agents  ./@roland-core/agents/
COPY --from=roland-builder /roland/recipes ./@roland-core/recipes/

RUN npm run build


# ── Stage 4: Production-only dependencies (strips ~60 MB of devDeps) ──────────
FROM node:22-alpine AS prod-deps
WORKDIR /app

COPY roland-web/package.json roland-web/package-lock.json* ./
COPY roland-web/@roland-core/package.json ./@roland-core/package.json

COPY --from=roland-builder /roland/dist    ./@roland-core/dist/
COPY --from=roland-builder /roland/agents  ./@roland-core/agents/
COPY --from=roland-builder /roland/recipes ./@roland-core/recipes/

RUN npm ci --omit=dev


# ── Stage 5: Production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# git is required by Roland agents (branch creation, commits, push, PR)
RUN apk add --no-cache git

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/roland-web.db \
    PROJECTS_DIR=/data/projects

# /data is the Railway persistent volume — must be writable by the node user
RUN mkdir -p /data/projects && chown -R node:node /data
VOLUME ["/data"]

USER node

# Production node_modules + @roland-core (symlinked via node_modules/@roland/core)
COPY --from=prod-deps   --chown=node:node /app/node_modules  ./node_modules
COPY --from=prod-deps   --chown=node:node /app/@roland-core  ./@roland-core

# Compiled Next.js app and server
COPY --from=web-builder --chown=node:node /app/.next         ./.next
COPY --from=web-builder --chown=node:node /app/dist          ./dist
COPY --from=web-builder --chown=node:node /app/package.json  ./

EXPOSE 3000

# Probe the unauthenticated /health endpoint — fast and always available
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:3000/health | grep -q '"ok"' || exit 1

CMD ["node", "--experimental-sqlite", "dist/server/index.js"]

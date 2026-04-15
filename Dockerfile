# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy lockfile and manifests first (layer cache)
COPY package.json pnpm-lock.yaml ./

# Install all deps (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/build ./build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "build/index.js"]

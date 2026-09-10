FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9.15.4

# Install dependencies (including devDeps needed for build)
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN NODE_ENV=development pnpm install --frozen-lockfile

# Build the app, then drop devDependencies to shrink the runtime image
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN NODE_ENV=production pnpm run build \
  && pnpm prune --prod

# Production runtime
FROM base AS runner
# pg_dump refuses to run against a server on a *newer* major version than
# itself, and Debian bookworm's own repo only ships v15 (too old — this was
# hardcoded to v16 before and broke again the moment prod's server moved
# past that). Pull whatever major PGDG currently publishes as newest instead
# of pinning a number, so this stays correct regardless of which Postgres
# major prod actually runs.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg lsb-release \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && LATEST_PG_CLIENT=$(apt-cache search '^postgresql-client-[0-9]+$' | grep -oP 'postgresql-client-\K[0-9]+' | sort -rn | head -1) \
  && apt-get install -y --no-install-recommends "postgresql-client-${LATEST_PG_CLIENT}" \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/build ./build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["pnpm", "start"]

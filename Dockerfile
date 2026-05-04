# syntax=docker/dockerfile:1.6

# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (use lockfile if present)
COPY package.json package-lock.json* bun.lockb* ./
RUN npm install --no-audit --no-fund

# Copy sources and build
COPY . .

# Vite build-time env vars (passed via Dokploy build args)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine AS runner

# SPA-friendly nginx config (handles client-side routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Startup script: writes /usr/share/nginx/html/config.js from runtime env vars,
# then launches nginx. Used because Dokploy ignores docker-compose `command:`.
COPY docker/start-nginx.sh /usr/local/bin/start-nginx.sh
RUN chmod +x /usr/local/bin/start-nginx.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["/usr/local/bin/start-nginx.sh"]

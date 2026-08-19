# syntax=docker/dockerfile:1.7
# DJKado — production image: static web app + Hono API served by one Node process.
# Build:  docker build -t djkado .
# Run:    docker run -p 51732:51732 djkado
# Dokploy: Application → build type "Dockerfile" → container port 51732 (see README ▸ Deploy).

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
# Renderer-side env baked in at build time (optional; leave empty for mock streaming sources)
ARG VITE_SPOTIFY_CLIENT_ID=
ARG VITE_SPOTIFY_REDIRECT_URI=
ENV VITE_SPOTIFY_CLIENT_ID=$VITE_SPOTIFY_CLIENT_ID VITE_SPOTIFY_REDIRECT_URI=$VITE_SPOTIFY_REDIRECT_URI
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
# esbuild/sharp/electron post-install scripts are only needed for desktop/icon work; skip them here
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm exec vite build && pnpm build:server

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=51732 STATIC_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
RUN adduser -S -u 10001 djkado && chown -R djkado /app
USER djkado
EXPOSE 51732
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/index.mjs"]

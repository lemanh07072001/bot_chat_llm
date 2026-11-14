# syntax=docker/dockerfile:1

# Build context is the repo root (app/) so both images share one context.

FROM node:24-alpine AS build
WORKDIR /build
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./

# Next inlines every NEXT_PUBLIC_* value at build time, so the browser-facing
# api url has to be known here. API_URL (server-side only) stays a runtime env.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /srv/admin
ENV NODE_ENV=production
ENV PORT=3000
# The standalone server binds loopback unless told otherwise, which the reverse
# proxy could not reach.
ENV HOSTNAME=0.0.0.0

# `output: "standalone"` traces the dependencies it actually needs; static
# assets and public/ have to be copied in alongside it.
COPY --from=build /build/.next/standalone ./
COPY --from=build /build/.next/static ./.next/static
COPY --from=build /build/public ./public

EXPOSE 3000

USER node
CMD ["node", "server.js"]

# syntax=docker/dockerfile:1

# Build context is the repo root (app/), because this image needs both the api
# and the widget: the api serves the widget bundle itself, so the two can never
# drift out of sync.

FROM node:24-alpine AS widget-build
WORKDIR /build
COPY widget/package.json widget/package-lock.json ./
RUN npm ci
COPY widget/tsconfig.json widget/vite.config.ts ./
COPY widget/src ./src
# `vite build` copies public/ into dist/, which is where the api finds the
# emoji dataset and fill font.
COPY widget/public ./public
RUN npm run build

FROM node:24-alpine AS api-build
WORKDIR /build
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json api/tsconfig.build.json api/nest-cli.json ./
COPY api/src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /srv/api
ENV NODE_ENV=production

# Only the production dependency tree ships; the build toolchain stays behind.
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=api-build /build/dist ./dist
COPY --from=widget-build /build/dist /srv/widget

# Where WidgetAssetService reads the bundle from.
ENV WIDGET_ASSET_DIR=/srv/widget
ENV PORT=3002
EXPOSE 3002

RUN mkdir -p uploads/site-images && chown -R node:node uploads
USER node
CMD ["node", "dist/main.js"]

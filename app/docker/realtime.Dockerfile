FROM node:24-alpine AS build
WORKDIR /build/realtime
COPY realtime/package*.json ./
RUN npm ci
COPY realtime/ ./
COPY api/src /build/api/src
RUN npm run build
FROM node:24-alpine
WORKDIR /srv/realtime
ENV NODE_ENV=production PORT=3003 SERVICE_ROLE=realtime
COPY realtime/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /build/realtime/dist ./dist
USER node
EXPOSE 3003
CMD ["node", "dist/main.js"]

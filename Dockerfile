FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

ARG REACT_APP_BACKEND_URL=
ARG REACT_APP_GA_ID=
ENV CI=false \
    REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL \
    REACT_APP_GA_ID=$REACT_APP_GA_ID

RUN npm run build


FROM node:20-alpine AS backend-deps

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev


FROM node:20-alpine AS backend

ENV NODE_ENV=production \
    BACKEND_PORT=3001

WORKDIR /app

COPY --chown=node:node backend/ ./backend/
COPY --from=backend-deps --chown=node:node /app/backend/node_modules ./backend/node_modules

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.BACKEND_PORT || 3001) + '/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "backend/server.js"]


FROM nginx:1.27-alpine AS frontend

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/build /usr/share/nginx/html

EXPOSE 8080

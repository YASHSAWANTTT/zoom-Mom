# Single production image: React build + Express API (same origin for Zoom App)
# RTMS runs as a separate Railway service (see docs/RAILWAY.md)

FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY rtms/package.json rtms/
RUN npm ci

COPY frontend ./frontend
# CRA treats warnings as errors in CI environments
ENV CI=false
ENV GENERATE_SOURCEMAP=false
RUN cd frontend && npm run build

COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate

ENV NODE_ENV=production
ENV SERVE_FRONTEND_STATIC=true

EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --skip-generate && node src/server.js"]

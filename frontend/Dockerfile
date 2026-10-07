# syntax=docker/dockerfile:1
#
# BoardGames-Frontend (React 19, Vite 8) - gebaut und ausgeliefert von nginx.
#
# Bauen:  docker compose build frontend
# Starten: docker compose up -d frontend   ->  http://localhost:5173
#
# Das Frontend braucht zur Bauzeit keine Variablen: es ruft ausschliesslich
# relative "/api"-Pfade (frontend/src/lib/api.ts). nginx reicht die an das
# Backend weiter, dieselbe Konstruktion wie der Vite-Proxy in vite.config.ts.

# ---------------------------------------------------------------------------
# Build: tsc -b && vite build  ->  /app/dist
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build

WORKDIR /app

# package.json und Lockfile zuerst: die Installation bleibt im Cache, wenn sich
# nur Quelltext aendert.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Laufzeit: nginx liefert dist/ aus und proxyt /api
# ---------------------------------------------------------------------------
FROM nginx:1-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# busybox wget steckt im Alpine-nginx bereits drin.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1

# ---------------------------------------------------------------------------
# Entwicklung: Vite-Dev-Server mit HMR, dazu compose.dev.yml.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite leitet /api hierhin weiter; "backend" ist der Service-Name im Netzwerk.
ENV BACKEND_URL=http://backend:3000
# Port 80 wie im nginx-Stage, damit die Port-Zuordnung aus docker-compose.yml
# unveraendert gilt. Compose haengt Listen an, statt sie zu ersetzen - ein
# zweiter ports-Eintrag in der Override wuerde denselben Host-Port doppelt
# publizieren. Der Host-Port bleibt also 5173.
EXPOSE 80

# --host, damit der Dev-Server auch von aussen erreichbar ist.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80"]

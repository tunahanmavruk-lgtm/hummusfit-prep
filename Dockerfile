FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libxss1 \
  libgtk-3-0 \
  libxshmfence1 \
  libx11-xcb1 \
  libxcb-dri3-0 \
  fonts-liberation \
  wget \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN npx puppeteer browsers install chrome
ARG CACHEBUST=1
COPY . .

EXPOSE 3000
CMD ["node", "app.js"]

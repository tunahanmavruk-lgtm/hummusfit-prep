FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 libatk1.0-0t64 libatk-bridge2.0-0 libcups2 libgbm1 \
  libasound2t64 libpangocairo-1.0-0 libxss1 libgtk-3-0t64 \
  libxshmfence1 chromium \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3000
CMD ["node", "app.js"]

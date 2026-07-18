FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 \
  libasound2 libpangocairo-1.0-0 libxss1 libgtk-3-0 \
  libxshmfence1 libx11-xcb1 libxcb-dri3-0 fonts-liberation \
  wget unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY . .

RUN which chromium || which chromium-browser || find / -name chromium 2>/dev/null | head -3 || echo "chromium not found"
EXPOSE 3000
CMD ["node", "app.js"]

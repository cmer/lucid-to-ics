FROM --platform=linux/amd64 node:18-bullseye-slim

# Install dependencies for Puppeteer and cron
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    cron \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libnspr4 \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    libatspi2.0-0 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Note: Chrome will be installed by Puppeteer after npm install

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and let Puppeteer download Chrome
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Install Chrome using Puppeteer's new browser management as node user
# This ensures Chrome is installed in the correct location for the node user
RUN chown -R node:node /app
USER node
RUN npx puppeteer browsers install chrome
USER root

# Create entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create cron script
COPY cron-scraper.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/cron-scraper.sh

# Set environment for Docker
ENV DOCKER_ENV=true

# Final ownership adjustment (Chrome is already installed as node user)
RUN chown -R node:node /app

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Use entrypoint script to set up cron and start services
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
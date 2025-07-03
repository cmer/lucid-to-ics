#!/bin/bash

# Set environment for cron
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export NODE_ENV="${NODE_ENV:-production}"

# Change to app directory
cd /app

echo "$(date): Starting scheduled scrape..."

# Run scraper as node user
su node -c "npm run scrape" 2>&1

scrape_exit_code=$?

if [ $scrape_exit_code -eq 0 ]; then
    echo "$(date): Scrape completed successfully"
else
    echo "$(date): Scrape failed with exit code $scrape_exit_code"
fi

echo "$(date): Scheduled scrape finished"
echo "---"
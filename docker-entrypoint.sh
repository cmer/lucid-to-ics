#!/bin/bash
set -e

# Default scraper interval is 240 minutes (4 hours) if not set
SCRAPER_INTERVAL=${SCRAPER_INTERVAL:-240}

echo "🚀 Starting Lucid ICS Server with scraper interval: ${SCRAPER_INTERVAL} minutes"

# Calculate cron schedule from minutes
# Convert minutes to hours and minutes for cron format
if [ "$SCRAPER_INTERVAL" -ge 60 ]; then
    hours=$((SCRAPER_INTERVAL / 60))
    remaining_minutes=$((SCRAPER_INTERVAL % 60))
    
    if [ "$remaining_minutes" -eq 0 ]; then
        # Even hours: run every X hours
        cron_schedule="0 */${hours} * * *"
    else
        # Complex schedule: calculate specific times
        # For simplicity, convert to minutes and use */X format if possible
        if [ "$SCRAPER_INTERVAL" -le 1440 ]; then  # Less than 24 hours
            cron_schedule="*/${SCRAPER_INTERVAL} * * * *"
        else
            # For very long intervals, run once per day
            cron_schedule="0 0 * * *"
        fi
    fi
else
    # Less than 60 minutes: use minute-based cron
    cron_schedule="*/${SCRAPER_INTERVAL} * * * *"
fi

echo "📅 Cron schedule: ${cron_schedule}"

# Create cron job for scraper
echo "${cron_schedule} /usr/local/bin/cron-scraper.sh >> /var/log/scraper.log 2>&1" > /tmp/crontab

# Install cron job as root (required for cron)
crontab /tmp/crontab

# Create log file
touch /var/log/scraper.log
chmod 666 /var/log/scraper.log

# Start cron daemon in background
cron

# Change to node user for the application
su node -c "cd /app && npm start" &

# Wait a moment for server to start, then run initial scrape
echo "⏳ Starting server and preparing initial scrape..."
sleep 5

echo "🔄 Running initial scrape..."
su node -c "cd /app && npm run scrape" &

# Keep the container running and show logs
echo "✅ Services started. Watching logs..."
echo "📊 Server logs:"
tail -f /dev/null &

# Wait for any process to exit
wait
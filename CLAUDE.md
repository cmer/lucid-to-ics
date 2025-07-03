# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web scraper that extracts room bookings from Lucid Private Offices and serves them as an ICS calendar feed. It uses Puppeteer for browser automation, OpenRouter API for LLM-based HTML parsing, and serves the calendar via Express.

## Common Commands

### Development
```bash
npm install              # Install dependencies
npm run dev             # Start server with nodemon (auto-reload)
npm start               # Start production server
npm run scrape          # Run scraper manually
```

### Docker Operations
```bash
docker-compose up -d    # Start service
docker-compose logs -f lucid-ics  # View logs
docker-compose exec lucid-ics npm run scrape  # Manual scrape in container
docker-compose down     # Stop service
docker build --no-cache -t lucid-to-ics .  # Rebuild image without cache
```

### Testing and Debugging
```bash
# Test scraper locally
OPENROUTER_API_KEY=your_key LUCID_EMAIL=your_email npm run scrape

# Test Docker Chrome installation
docker exec lucid-ics ls -la /home/node/.cache/puppeteer/chrome/

# Check for Chrome dependencies
docker exec lucid-ics ldd /home/node/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome
```

## Architecture and Key Design Decisions

### Modular Architecture
The codebase was refactored into a modular structure with clear separation of concerns:

1. **Configuration Layer** (`src/config/constants.js`)
   - Centralized constants eliminate magic numbers
   - Environment-aware configuration
   - All timeouts, URLs, selectors in one place

2. **Utility Layer** (`src/utils/`)
   - `logger.js`: Structured logging with environment-aware formatting
   - `browser-manager.js`: Puppeteer browser lifecycle management
   - `file-utils.js`: File operations with proper error handling

3. **Scraper Module** (`src/scraper/`)
   - `scrape.js`: Main orchestrator (no longer a monolithic class)
   - `login-helpers.js`: Authentication flow broken into focused functions
   - `extraction-strategies.js`: Multiple HTML extraction strategies
   - `llm-parser.js`: OpenRouter API integration

4. **API Layer** (`src/api/calendar.js`)
   - ICS generation using ical-generator
   - HTTP Basic Auth middleware
   - Calendar endpoint serving

### HTML Extraction Optimization
The scraper implements intelligent HTML extraction to minimize LLM token usage:
- Strategy 1: Text search for booking-related terms
- Strategy 2: CSS selector-based extraction
- Strategy 3: Main content extraction as fallback
- Typically achieves 85-95% size reduction while preserving booking data

### Authentication Flow
1. Puppeteer navigates to Lucid login page
2. Auto-fills email and requests magic link
3. Waits for user to paste magic link at `/login` endpoint
4. Uses magic link to complete authentication
5. Saves cookies for session persistence

### Docker Configuration
- Uses `--platform=linux/amd64` for consistent Chrome architecture
- Chrome installed as `node` user (not root) to fix permission issues
- Comprehensive Chrome dependencies included
- Automated scraping via cron in container

## Critical Implementation Details

### Chrome in Docker
The Dockerfile installs Chrome as the `node` user to ensure proper permissions:
```dockerfile
USER node
RUN npx puppeteer browsers install chrome
USER root
```

### Cookie Management
- Cookies stored in `cookies.json` (gitignored)
- Loaded before each scrape attempt
- Enables persistent sessions

### Error Handling Pattern
All async operations use try-catch with structured logging:
```javascript
try {
  // operation
} catch (error) {
  logger.error('Operation failed', { 
    message: error.message,
    stack: error.stack 
  });
  throw error;
}
```

### LLM Prompt Structure
The LLM parser sends optimized HTML with a specific prompt requesting JSON output with booking details (title, location, start/end times).

## Environment Variables

Required:
- `OPENROUTER_API_KEY`: For LLM parsing
- `LUCID_EMAIL`: User's Lucid account email

Optional:
- `LLM_MODEL`: Default `openai/gpt-4o-mini`
- `SCRAPER_INTERVAL`: Minutes between scrapes (default 240)
- `HTTP_AUTH_USER`: Enable HTTP Basic Auth
- `HTTP_AUTH_PASSWORD`: Optional password for auth

## Known Issues and Solutions

1. **Docker Chrome Architecture**: Must use `--platform=linux/amd64` and install Chrome as `node` user
2. **Puppeteer API Changes**: Use `new Promise(resolve => setTimeout(resolve, ms))` instead of deprecated `waitForTimeout`
3. **Login URL Changes**: Login endpoint moved from `/sign-in` to homepage
4. **Session Expiry**: Magic link authentication required when cookies expire

## File Structure Context

- `data/bookings.json`: Auto-generated scraped data
- `cookies.json`: Session persistence (gitignored)
- `login_url.txt`: Temporary magic link storage
- `src/templates/`: HTML templates for login form
- `docker-entrypoint.sh`: Sets up cron for automated scraping
- `cron-scraper.sh`: Script executed by cron in Docker
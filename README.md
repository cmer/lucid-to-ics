# Lucid Private Offices to ICS Calendar

A web scraper that extracts room bookings from Lucid Private Offices and serves them as an ICS calendar feed.

## Features

- Scrapes bookings from https://my.lucidprivateoffices.com/account/bookings
- Uses Puppeteer for browser automation and login handling
- Parses booking data with Google Gemini Flash via OpenRouter
- Serves bookings as ICS calendar format at `/calendar.ics`
- Dockerized for easy deployment
- Easy web-based login with magic link URLs
- Session persistence with cookie management

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Set environment variables**:
   - `OPENROUTER_API_KEY`: Your OpenRouter API key
   - `LUCID_EMAIL`: Your Lucid Private Offices email
   - `LLM_MODEL`: Model to use for parsing (default: openai/gpt-4o-mini)
   - `PORT`: Server port (default: 3000)

## Usage

### Manual Scraping

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Run the scraper**:
   ```bash
   npm run scrape
   ```

3. **Complete authentication** (first time only):
   - The scraper will automatically request a magic link from Lucid Private Offices
   - Check your email for the login link from Lucid Private Offices
   - Copy the entire URL from the email
   - Go to **http://localhost:3000/login** and paste the URL
   - Click "Submit" - the scraper will automatically complete authentication

4. **Access calendar**:
   - Browser: http://localhost:3000/calendar.ics
   - Calendar app: Add subscription to this URL

**Note**: After the first login, the scraper will remember your session via cookies and won't require the login process again unless the session expires.

### Docker Deployment

1. **Build and run**:
   ```bash
   docker-compose up -d
   ```

2. **For initial authentication**:
   - Run `docker-compose exec lucid-ics npm run scrape`
   - Follow the same login process using the web form at http://localhost:3000/login

### Automated Scraping

Set up a cron job to run scraping regularly:

```bash
# Add to crontab (runs every 2 hours during business hours)
0 8-18/2 * * 1-5 cd /path/to/lucid_to_ics && npm run scrape
```

**Note**: Automated scraping works best after the initial login, as the scraper will use saved cookies for authentication.

## API Endpoints

- `GET /` - Health check and service info
- `GET /calendar.ics` - Download ICS calendar file with all bookings
- `GET /login` - Web form for pasting magic link URLs during authentication
- `POST /login` - Submit magic link URL (used by the web form)

## Project Structure

```
├── src/
│   ├── scraper/
│   │   ├── scrape.js       # Main scraper with Puppeteer
│   │   └── llm-parser.js   # OpenRouter/Gemini integration
│   ├── api/
│   │   └── calendar.js     # ICS generation and endpoints
│   └── server.js           # Express server
├── data/
│   └── bookings.json       # Scraped booking data (auto-generated)
├── Dockerfile              # Docker container setup
├── docker-compose.yml      # Docker Compose configuration
└── package.json
```

## Login Flow

1. Scraper navigates to Lucid Private Offices login page
2. Automatically enters your email address
3. Requests magic link to be sent to your email
4. Waits for you to paste the magic link URL at http://localhost:3000/login
5. Uses the magic link to complete authentication
6. Saves login cookies for future sessions (single-use URL is deleted)
7. Scrapes booking data and parses with LLM
8. Saves data to JSON and serves as ICS format

## Troubleshooting

- **Login issues**: Make sure `LUCID_EMAIL` is correct and check email for magic link
- **Magic link not working**: Ensure you copy the entire URL from the email and that it hasn't expired
- **Empty calendar**: Run scraper first with `npm run scrape`
- **Session expired**: If scraper asks for login again, repeat the magic link process
- **Docker issues**: Ensure proper permissions on data directory
- **LLM parsing errors**: Check `OPENROUTER_API_KEY` is valid and has credits
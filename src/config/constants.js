// Configuration constants for the Lucid scraper application

module.exports = {
  // Timeouts (in milliseconds)
  TIMEOUTS: {
    BROWSER_LAUNCH: 30000,
    PAGE_NAVIGATION: 30000,
    PAGE_LOAD_WAIT: 8000,
    ELEMENT_WAIT: 20000,
    MAGIC_LINK_WAIT: 600000, // 10 minutes
    FORM_SUBMIT_WAIT: 10000
  },

  // Browser configuration
  BROWSER: {
    VIEWPORT_WIDTH: 1280,
    VIEWPORT_HEIGHT: 720,
    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    CHROME_ARGS: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage'
    ],
    HEADLESS_MODE: "new"
  },

  // File paths
  PATHS: {
    COOKIES_FILE: 'cookies.json',
    LOGIN_URL_FILE: 'login_url.txt',
    BOOKINGS_DATA: 'data/bookings.json',
    CHROME_EXECUTABLE_MAC: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    CHROME_EXECUTABLE_LINUX: '/usr/bin/google-chrome-stable'
  },

  // URLs
  URLS: {
    BASE: 'https://my.lucidprivateoffices.com',
    LOGIN: 'https://my.lucidprivateoffices.com/sign-in',
    BOOKINGS: 'https://my.lucidprivateoffices.com/account/bookings'
  },

  // Search terms for booking extraction
  BOOKING_SEARCH_TERMS: [
    'my bookings',
    'bookings',
    'reservations', 
    'my reservations',
    'upcoming',
    'past bookings'
  ],

  // CSS selectors for booking extraction
  BOOKING_SELECTORS: [
    '[class*="booking"]',
    '[class*="reservation"]', 
    '[class*="appointment"]',
    '[class*="event"]',
    '[id*="booking"]',
    '[id*="reservation"]',
    '.bookings',
    '.reservations',
    '#bookings',
    '#reservations'
  ],

  // Main content selectors (fallback)
  MAIN_CONTENT_SELECTORS: [
    'main', 
    '.main', 
    '#main', 
    '.content', 
    '#content', 
    '.container'
  ],

  // Environment detection
  ENVIRONMENT: {
    isDocker: () => process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV,
    isDevelopment: () => process.env.NODE_ENV === 'development',
    isProduction: () => process.env.NODE_ENV === 'production'
  },

  // Validation thresholds
  THRESHOLDS: {
    MIN_BOOKING_SECTION_SIZE: 100,
    MIN_MAIN_CONTENT_SIZE: 1000
  },

  // LLM configuration
  LLM: {
    MAX_TOKENS: 4000,
    TEMPERATURE: 0.1,
    DEFAULT_MODEL: 'openai/gpt-4o-mini'
  },

  // Server configuration
  SERVER: {
    DEFAULT_PORT: 3000,
    HEALTH_CHECK_INTERVAL: 30000,
    HEALTH_CHECK_TIMEOUT: 3000
  }
};
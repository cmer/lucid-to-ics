const fs = require('fs-extra');
const path = require('path');
const { parseBookingsWithLLM } = require('./llm-parser');
const { extractBookingsSection } = require('./extraction-strategies');
const { launchBrowser, createPage, closeBrowser, navigateToUrl } = require('../utils/browser-manager');
const { TIMEOUTS, PATHS, URLS } = require('../config/constants');
const { scraperLogger: logger } = require('../utils/logger');
const {
  findEmailInput,
  submitEmailForm,
  waitForMagicLink,
  processMagicLink,
  cleanupMagicLink,
  verifyLoginStatus
} = require('./login-helpers');

// Load environment variables
require('dotenv').config();

class LucidScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    logger.info('LucidScraper initialized');
  }

  async init() {
    try {
      this.browser = await launchBrowser();
      this.page = await createPage(this.browser);
      
      await this.loadCookies();
      logger.success('Browser initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize browser', error);
      throw error;
    }
  }

  async loadCookies() {
    const cookiesPath = path.join(__dirname, '../../', PATHS.COOKIES_FILE);
    
    if (await fs.pathExists(cookiesPath)) {
      try {
        const cookies = await fs.readJson(cookiesPath);
        await this.page.setCookie(...cookies);
        logger.info(`Loaded ${cookies.length} cookies from previous session`);
      } catch (error) {
        logger.warn('Could not load cookies', error);
      }
    } else {
      logger.debug('No existing cookies found');
    }
  }

  async saveCookies() {
    try {
      const cookies = await this.page.cookies();
      const cookiesPath = path.join(__dirname, '../../', PATHS.COOKIES_FILE);
      await fs.writeJson(cookiesPath, cookies, { spaces: 2 });
      logger.info(`Saved ${cookies.length} cookies for future sessions`);
    } catch (error) {
      logger.warn('Could not save cookies', error);
    }
  }

  async checkIfLoggedIn() {
    logger.progress('Checking if already logged in');
    
    try {
      await navigateToUrl(this.page, URLS.BOOKINGS);
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.PAGE_LOAD_WAIT));
      
      const isLoggedIn = await verifyLoginStatus(this.page);
      
      if (isLoggedIn) {
        logger.success('Already logged in from previous session!');
        return true;
      }
      
      logger.info('User needs to authenticate');
      return false;
      
    } catch (error) {
      logger.error('Error checking login status', error);
      return false;
    }
  }

  async performLogin() {
    logger.progress('Starting login process');
    
    try {
      // Navigate to login page
      await navigateToUrl(this.page, URLS.LOGIN);
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.PAGE_LOAD_WAIT));
      
      const email = process.env.LUCID_EMAIL;
      if (!email) {
        throw new Error('LUCID_EMAIL environment variable is required');
      }
      
      // Find email input
      const emailInput = await findEmailInput(this.page);
      if (!emailInput.found) {
        throw new Error('Could not find email input field on login page');
      }
      
      // Submit email form
      await submitEmailForm(this.page, email, emailInput.selector);
      
      // Wait for magic link
      const magicLinkUrl = await waitForMagicLink();
      
      // Process magic link
      const success = await processMagicLink(this.page, magicLinkUrl);
      
      if (!success) {
        throw new Error('Magic link authentication failed');
      }
      
      // Clean up the magic link file
      await cleanupMagicLink();
      
      // Save cookies for future sessions
      await this.saveCookies();
      
      logger.success('Login completed successfully');
      return true;
      
    } catch (error) {
      logger.error('Login process failed', error);
      throw error;
    }
  }

  async ensureAuthenticated() {
    const isLoggedIn = await this.checkIfLoggedIn();
    
    if (!isLoggedIn) {
      await this.performLogin();
    }
    
    return true;
  }

  async scrapeBookings() {
    logger.progress('Navigating to bookings page');
    
    try {
      // Check if we're already on the bookings page
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/account/bookings')) {
        await navigateToUrl(this.page, URLS.BOOKINGS);
      } else {
        logger.debug('Already on bookings page');
      }

      // Wait for the page to fully load (Nuxt.js SPA)
      logger.progress('Waiting for page to load');
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.PAGE_LOAD_WAIT));
      
      // Wait for booking content to appear
      logger.progress('Looking for booking content');
      try {
        await this.page.waitForFunction(
          () => {
            const text = document.body.innerText.toLowerCase();
            const hasBookingText = text.includes('booking') || text.includes('reservation') || text.includes('room');
            const hasBookingElements = document.querySelectorAll('[class*="booking"], [class*="reservation"], [class*="room"]').length > 0;
            const notLoading = !text.includes('loading');
            return (hasBookingText || hasBookingElements) && notLoading;
          },
          { timeout: TIMEOUTS.ELEMENT_WAIT }
        );
        logger.success('Booking content found!');
      } catch (error) {
        logger.warn('No specific booking content detected, proceeding with full page');
      }

      // Try to extract only the bookings section first
      const bookingsSection = await extractBookingsSection(this.page);
      
      if (bookingsSection) {
        const fullPageSize = (await this.page.content()).length;
        const reduction = ((fullPageSize - bookingsSection.cleanedSize) / fullPageSize * 100).toFixed(1);
        logger.success(`Using optimized bookings section (${reduction}% size reduction)`, {
          fullPageSize,
          optimizedSize: bookingsSection.cleanedSize,
          method: bookingsSection.method
        });
        return bookingsSection.html;
      } else {
        // Fallback to full page
        logger.warn('Could not extract specific bookings section, using full page');
        const html = await this.page.content();
        logger.info(`Full page HTML: ${html.length} characters`);
        return html;
      }
      
    } catch (error) {
      logger.error('Error scraping bookings', error);
      logger.debug('Current URL', { url: this.page.url() });
      throw error;
    }
  }

  async close() {
    try {
      await closeBrowser(this.browser, this.page);
    } catch (error) {
      logger.error('Error during cleanup', error);
    }
  }

  async run() {
    try {
      await this.init();
      await this.ensureAuthenticated();
      
      const html = await this.scrapeBookings();
      const bookings = await parseBookingsWithLLM(html);
      
      if (bookings && bookings.length > 0) {
        const dataDir = path.join(__dirname, '../../data');
        await fs.ensureDir(dataDir);
        
        const bookingsData = {
          bookings,
          lastUpdated: new Date().toISOString()
        };
        
        const outputPath = path.join(__dirname, '../../', PATHS.BOOKINGS_DATA);
        await fs.writeJson(outputPath, bookingsData, { spaces: 2 });
        
        logger.success(`Successfully scraped ${bookings.length} bookings and saved to ${outputPath}`);
      } else {
        logger.warn('No bookings found or parsing failed');
      }
      
      return bookings;
      
    } catch (error) {
      logger.error('Scraping failed', error);
      throw error;
    } finally {
      await this.close();
    }
  }
}

// Run scraper if this file is executed directly
if (require.main === module) {
  const scraper = new LucidScraper();
  scraper.run()
    .then(() => {
      logger.success('Scraping completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Scraping failed', error);
      process.exit(1);
    });
}

module.exports = LucidScraper;
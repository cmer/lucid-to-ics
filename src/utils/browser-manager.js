// Browser management utilities

const puppeteer = require('puppeteer');
const fs = require('fs');
const { BROWSER, TIMEOUTS, PATHS, ENVIRONMENT } = require('../config/constants');
const { createLogger } = require('./logger');

const logger = createLogger('BROWSER');

/**
 * Get Chrome configuration based on environment
 */
function getChromeConfig() {
  const isDocker = ENVIRONMENT.isDocker();
  
  const config = {
    headless: BROWSER.HEADLESS_MODE,
    args: BROWSER.CHROME_ARGS,
    timeout: TIMEOUTS.BROWSER_LAUNCH
  };
  
  if (!isDocker) {
    // Local development - use system Chrome if available
    if (fs.existsSync(PATHS.CHROME_EXECUTABLE_MAC)) {
      config.executablePath = PATHS.CHROME_EXECUTABLE_MAC;
      logger.debug('Using macOS Chrome executable');
    }
  } else {
    // In Docker, try to use installed Chrome first, fall back to bundled Chromium
    if (fs.existsSync(PATHS.CHROME_EXECUTABLE_LINUX)) {
      config.executablePath = PATHS.CHROME_EXECUTABLE_LINUX;
      logger.debug('Using Linux Chrome executable');
    } else {
      logger.debug('Using Puppeteer bundled Chromium');
    }
  }
  
  return config;
}

/**
 * Launch browser with optimal configuration
 */
async function launchBrowser() {
  logger.progress('Initializing Puppeteer browser');
  
  try {
    const config = getChromeConfig();
    logger.debug('Browser config', { headless: config.headless, hasExecutable: !!config.executablePath });
    
    const browser = await puppeteer.launch(config);
    logger.success('Browser launched successfully');
    
    return browser;
    
  } catch (error) {
    logger.error('Failed to launch browser', error);
    throw new Error(`Browser launch failed: ${error.message}`);
  }
}

/**
 * Create and configure a new page
 */
async function createPage(browser) {
  logger.debug('Creating new browser page');
  
  try {
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({
      width: BROWSER.VIEWPORT_WIDTH,
      height: BROWSER.VIEWPORT_HEIGHT
    });
    
    // Set user agent to avoid detection
    await page.setUserAgent(BROWSER.USER_AGENT);
    
    logger.debug('Browser page configured');
    return page;
    
  } catch (error) {
    logger.error('Failed to create browser page', error);
    throw error;
  }
}

/**
 * Safely close browser resources
 */
async function closeBrowser(browser, page = null) {
  logger.debug('Closing browser resources');
  
  const errors = [];
  
  try {
    if (page && !page.isClosed()) {
      await page.close();
      logger.debug('Page closed successfully');
    }
  } catch (error) {
    logger.error('Error closing page', error);
    errors.push(error);
  }
  
  try {
    if (browser && browser.isConnected()) {
      await browser.close();
      logger.success('Browser closed successfully');
    }
  } catch (error) {
    logger.error('Error closing browser', error);
    errors.push(error);
  }
  
  if (errors.length > 0) {
    throw new Error(`Browser cleanup had ${errors.length} errors: ${errors.map(e => e.message).join(', ')}`);
  }
}

/**
 * Navigate to URL with error handling and retries
 */
async function navigateToUrl(page, url, options = {}) {
  const maxRetries = options.retries || 2;
  const timeout = options.timeout || TIMEOUTS.PAGE_NAVIGATION;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Navigating to URL (attempt ${attempt}/${maxRetries})`, { url });
      
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout
      });
      
      logger.success('Navigation successful', { url, attempt });
      return;
      
    } catch (error) {
      logger.warn(`Navigation attempt ${attempt} failed`, { url, error: error.message });
      
      if (attempt === maxRetries) {
        throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

module.exports = {
  launchBrowser,
  createPage,
  closeBrowser,
  navigateToUrl,
  getChromeConfig
};
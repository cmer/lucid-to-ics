const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const { parseBookingsWithLLM } = require('./llm-parser');

// Load environment variables
require('dotenv').config();

class LucidScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.loginUrlFile = path.join(__dirname, '../../login_url.txt');
    this.cookiesFile = path.join(__dirname, '../../data/cookies.json');
  }

  async init() {
    console.log('Initializing Puppeteer browser...');
    
    // Use the working configuration (system Chrome)
    try {
      // Use different Chrome paths for different environments
      const isDocker = process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV;
      const chromeConfig = {
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        timeout: 30000
      };
      
      if (!isDocker) {
        // Local development - use system Chrome if available
        chromeConfig.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      } else {
        // In Docker, try to use installed Chrome first, fall back to bundled Chromium
        const fs = require('fs');
        if (fs.existsSync('/usr/bin/google-chrome-stable')) {
          chromeConfig.executablePath = '/usr/bin/google-chrome-stable';
        }
        // If Chrome not available, Puppeteer will use bundled Chromium (default)
      }
      
      this.browser = await puppeteer.launch(chromeConfig);
      
      console.log('Browser launched successfully');
      
      this.page = await this.browser.newPage();
      
      // Set reasonable viewport
      await this.page.setViewport({ width: 1280, height: 720 });
      
      // Set timeouts
      this.page.setDefaultNavigationTimeout(45000);
      this.page.setDefaultTimeout(30000);
      
      // Set user agent
      await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Load existing cookies if they exist
      await this.loadCookies();
      
      console.log('Browser initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize browser:', error.message);
      throw new Error(`Browser initialization failed: ${error.message}`);
    }
  }

  async loadCookies() {
    try {
      if (await fs.pathExists(this.cookiesFile)) {
        const cookies = await fs.readJson(this.cookiesFile);
        await this.page.setCookie(...cookies);
        console.log(`Loaded ${cookies.length} cookies from previous session`);
      }
    } catch (error) {
      console.log('No existing cookies found or error loading them:', error.message);
    }
  }

  async saveCookies() {
    try {
      const cookies = await this.page.cookies();
      await fs.ensureDir(path.dirname(this.cookiesFile));
      await fs.writeJson(this.cookiesFile, cookies);
      console.log(`Saved ${cookies.length} cookies for future sessions`);
    } catch (error) {
      console.error('Error saving cookies:', error.message);
    }
  }

  async isLoggedIn() {
    try {
      // Check if we can access the bookings page directly
      console.log('Checking if already logged in...');
      await this.page.goto('https://my.lucidprivateoffices.com/account/bookings', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      
      await this.page.waitForTimeout(3000);
      
      const currentUrl = this.page.url();
      const pageText = await this.page.evaluate(() => document.body.innerText.toLowerCase());
      
      console.log('Login check - Current URL:', currentUrl);
      console.log('Login check - Page contains "sign in":', pageText.includes('sign in'));
      console.log('Login check - Page contains "email":', pageText.includes('email'));
      
      // If URL was redirected away from /account/bookings, we're not logged in
      if (!currentUrl.includes('/account/bookings')) {
        console.log('Redirected away from bookings page - not logged in');
        return false;
      }
      
      // If page contains login-related content, we're not logged in
      if (pageText.includes('sign in') || pageText.includes('login') || pageText.includes('enter your email')) {
        console.log('Page contains login prompts - not logged in');
        return false;
      }
      
      // More specific checks for actual booking content (not just the word "booking")
      const hasRealBookingContent = pageText.includes('my bookings') || 
                                   pageText.includes('upcoming') || 
                                   pageText.includes('past bookings') ||
                                   pageText.includes('reservation details');
      
      if (hasRealBookingContent) {
        console.log('Found actual booking content - logged in!');
        return true;
      }
      
      console.log('No clear indication of login status - assuming not logged in');
      return false;
      
    } catch (error) {
      console.log('Error checking login status:', error.message);
      return false;
    }
  }

  async waitForLoginUrl() {
    console.log('Waiting for login URL...');
    console.log(`Please paste the magic link URL in the web form at: http://localhost:3000/login`);
    console.log(`Or create a file at: ${this.loginUrlFile}`);
    console.log('Example: echo "https://my.lucidprivateoffices.com/auth/..." > login_url.txt');
    
    while (true) {
      try {
        if (await fs.pathExists(this.loginUrlFile)) {
          const url = (await fs.readFile(this.loginUrlFile, 'utf8')).trim();
          if (url.length > 0 && url.startsWith('http')) {
            console.log('📨 Found login URL, will use it now (single-use only)');
            // Don't delete here - wait until after successful login to ensure single-use
            return url;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
      } catch (error) {
        console.error('Error reading login URL file:', error.message);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async login() {
    // First check if we're already logged in from previous session
    if (await this.isLoggedIn()) {
      console.log('Already logged in from previous session!');
      return; // Skip login process
    }
    
    console.log('Need to log in...');
    
    try {
      // Start from the main site to find the correct login URL
      console.log('Navigating to main site...');
      await this.page.goto('https://my.lucidprivateoffices.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      await this.page.waitForTimeout(3000);
      
      // Look for login links on the main page
      const loginLink = await this.page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="login"], a[href*="sign-in"], a[href*="signin"]'));
        if (links.length > 0) return links[0].href;
        
        // Also check for buttons or text that might indicate login
        const buttons = Array.from(document.querySelectorAll('button, a')).filter(el => 
          el.textContent.toLowerCase().includes('login') || 
          el.textContent.toLowerCase().includes('sign in') ||
          el.textContent.toLowerCase().includes('account')
        );
        if (buttons.length > 0) return buttons[0].href || buttons[0].getAttribute('href');
        
        return null;
      });
      
      if (loginLink) {
        console.log('Found login link:', loginLink);
        await this.page.goto(loginLink, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
      } else {
        // Let's look for login forms on the current page or try to find them
        console.log('Searching for login form on current page...');
        
        // Check if there's already a login form on the current page
        const hasLoginForm = await this.page.evaluate(() => {
          const emailInputs = document.querySelectorAll('input[placeholder*="email" i], input[type="email"]');
          const sendButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
            btn.textContent.toLowerCase().includes('send') || 
            btn.textContent.toLowerCase().includes('login') ||
            btn.textContent.toLowerCase().includes('sign')
          );
          return emailInputs.length > 0 && sendButtons.length > 0;
        });
        
        if (hasLoginForm) {
          console.log('Found login form on current page!');
        } else {
          // Try some common paths and look for forms
          const pathsToTry = [
            'https://my.lucidprivateoffices.com/',
            'https://my.lucidprivateoffices.com/login',
            'https://my.lucidprivateoffices.com/sign-in',
            'https://my.lucidprivateoffices.com/auth',
            'https://lucidprivateoffices.com/',
            'https://lucidprivateoffices.com/login'
          ];
          
          let foundForm = false;
          for (const url of pathsToTry) {
            try {
              console.log(`Checking ${url} for login form...`);
              await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
              await this.page.waitForTimeout(3000);
              
              const formExists = await this.page.evaluate(() => {
                const emailInputs = document.querySelectorAll('input[placeholder*="email" i], input[type="email"]');
                const sendButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
                  btn.textContent.toLowerCase().includes('send') || 
                  btn.textContent.toLowerCase().includes('login') ||
                  btn.textContent.toLowerCase().includes('sign')
                );
                return emailInputs.length > 0 && sendButtons.length > 0;
              });
              
              if (formExists) {
                console.log(`Found login form at: ${url}`);
                foundForm = true;
                break;
              }
            } catch (error) {
              console.log(`Failed to check ${url}:`, error.message);
            }
          }
          
          if (!foundForm) {
            throw new Error('Could not find a login form on any page');
          }
        }
      }
      
      // Wait a bit for the page to fully load
      await this.page.waitForTimeout(3000);
      
      
      // Debug: take screenshot and check page content
      console.log('Taking screenshot for debugging...');
      await this.page.screenshot({ path: 'debug-login-page.png' });
      
      const pageContent = await this.page.content();
      console.log('Current page HTML length:', pageContent.length);
      console.log('Page title:', await this.page.title());
      console.log('Current URL:', this.page.url());
      
      const bodyText = await this.page.evaluate(() => document.body.innerText);
      console.log('Page text (first 300 chars):', bodyText.substring(0, 300));
      
      // Find all input elements to understand the form structure
      const allInputs = await this.page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map((input, index) => ({
          index,
          type: input.type,
          name: input.name,
          id: input.id,
          placeholder: input.placeholder,
          className: input.className,
          visible: input.offsetParent !== null
        }));
      });
      console.log('All inputs on page:', JSON.stringify(allInputs, null, 2));
      
      // Try different selectors for email input
      const emailSelectors = [
        'input[placeholder="Email"]',
        'input[type="email"]',
        'input[name*="email"]',
        'input[id*="email"]',
        'input[placeholder*="email" i]',
        'input[type="text"]' // fallback to any text input
      ];
      
      let emailInput = null;
      for (const selector of emailSelectors) {
        try {
          console.log(`Trying email selector: ${selector}`);
          await this.page.waitForSelector(selector, { timeout: 2000 });
          emailInput = selector;
          console.log(`Found email input with selector: ${selector}`);
          break;
        } catch (error) {
          console.log(`Selector ${selector} not found`);
        }
      }
      
      if (!emailInput) {
        throw new Error('Could not find email input field on the page');
      }
      
      console.log('Entering email address...');
      await this.page.type(emailInput, process.env.LUCID_EMAIL);
      
      // Trigger validation events to enable the button
      console.log('Triggering form validation...');
      await this.page.evaluate((selector) => {
        const input = document.querySelector(selector);
        if (input) {
          // Trigger various events that might enable the button
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          input.focus();
          input.blur();
        }
      }, emailInput);
      
      // Wait a moment for validation to process
      await this.page.waitForTimeout(1000);
      
      // Click submit button
      console.log('Clicking submit button...');
      
      // First, let's see what buttons are available
      const buttons = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(btn => ({
          text: btn.textContent.trim(),
          disabled: btn.disabled,
          type: btn.type,
          className: btn.className
        }));
      });
      console.log('Available buttons:', JSON.stringify(buttons, null, 2));
      
      // Wait for the button to become enabled
      console.log('Waiting for send button to be enabled...');
      try {
        await this.page.waitForFunction(
          () => {
            const button = Array.from(document.querySelectorAll('button')).find(btn => 
              btn.textContent.includes('Send Link') || btn.textContent.includes('Send')
            );
            return button && !button.disabled;
          },
          { timeout: 10000 }
        );
        console.log('Button is now enabled!');
      } catch (error) {
        console.log('Button did not become enabled within 10 seconds');
      }
      
      // Try to click the send link button and check if it worked
      const clickResult = await this.page.evaluate(() => {
        const button = Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent.includes('Send Link') || btn.textContent.includes('Send')
        );
        if (button) {
          console.log('Found button:', button.textContent, 'disabled:', button.disabled);
          if (!button.disabled) {
            button.click();
            return { success: true, buttonText: button.textContent, wasDisabled: false };
          } else {
            return { success: false, error: 'Button is still disabled', wasDisabled: true };
          }
        }
        return { success: false, error: 'Button not found' };
      });
      
      console.log('Button click result:', clickResult);
      
      // Wait a moment and check if the page changed or shows any success message
      await this.page.waitForTimeout(3000);
      
      // Check for any success messages or page changes (with error handling)
      let pageStatus = { hasSuccessMessage: false, hasErrorMessage: false, currentText: '' };
      try {
        pageStatus = await this.page.evaluate(() => {
          const body = document.body.innerText.toLowerCase();
          return {
            hasSuccessMessage: body.includes('sent') || body.includes('check your email') || body.includes('link has been'),
            hasErrorMessage: body.includes('error') || body.includes('failed') || body.includes('invalid'),
            currentText: document.body.innerText.substring(0, 500)
          };
        });
      } catch (error) {
        console.log('Could not evaluate page status (page may be navigating):', error.message);
        // Assume success if we can't evaluate (page is probably changing)
        pageStatus.hasSuccessMessage = true;
      }
      
      console.log('Page status after click:', pageStatus);
      
      // Take another screenshot to see the current state (with error handling)
      try {
        await this.page.screenshot({ path: 'debug-after-click.png' });
        console.log('Screenshot saved as debug-after-click.png');
      } catch (error) {
        console.log('Could not take screenshot:', error.message);
      }
      
      console.log('✉️  Magic link sent to your email!');
      console.log('📧 Please check your email and copy the login URL.');
      console.log('🌐 Paste the URL at: http://localhost:3000/login');
      console.log('⏳ Waiting for login URL...');
      
      // Wait for the user to provide the login URL
      const loginUrl = await this.waitForLoginUrl();
      console.log('📨 Received login URL, navigating...');
      
      // Navigate to the magic link URL
      await this.page.goto(loginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      // Wait for login to complete
      await this.page.waitForTimeout(3000);
      
      // Verify login was successful by checking the current URL or page content
      let currentUrl = '';
      let pageText = '';
      
      try {
        currentUrl = this.page.url();
      } catch (error) {
        console.log('Could not get current URL:', error.message);
      }
      
      try {
        pageText = await this.page.evaluate(() => document.body.innerText.toLowerCase());
      } catch (error) {
        console.log('Could not evaluate page text:', error.message);
      }
      
      // If we can't verify immediately, assume success (we'll check again later in isLoggedIn)
      const loginLikelySuccessful = currentUrl.includes('/account') || 
                                   pageText.includes('booking') || 
                                   pageText.includes('dashboard') ||
                                   currentUrl === '' || // Can't verify due to navigation
                                   pageText === '';     // Can't verify due to page loading
      
      if (loginLikelySuccessful) {
        // Login successful - delete the URL file so it can't be reused
        try {
          if (await fs.pathExists(this.loginUrlFile)) {
            await fs.remove(this.loginUrlFile);
            console.log('🗑️  Used login URL deleted (single-use only)');
          }
        } catch (error) {
          console.warn('Warning: Could not delete login URL file:', error.message);
        }
        
        // Save cookies for future sessions
        await this.saveCookies();
        console.log('✅ Login successful via magic link!');
      } else {
        throw new Error('Login may have failed - please check the magic link URL is correct and not expired');
      }
      
    } catch (error) {
      if (error.message.includes('MANUAL_LOGIN_REQUIRED')) {
        // This is expected - just re-throw without additional error logging
        throw error;
      } else {
        console.error('Login error:', error.message);
        console.log('Current URL:', this.page.url());
        throw error;
      }
    }
  }

  async scrapeBookings() {
    console.log('Navigating to bookings page...');
    
    try {
      // Check if we're already on the bookings page
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/account/bookings')) {
        await this.page.goto('https://my.lucidprivateoffices.com/account/bookings', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
      } else {
        console.log('Already on bookings page');
      }

      // Wait for the page to fully load (Nuxt.js SPA)
      console.log('Waiting for page to load...');
      await this.page.waitForTimeout(8000);
      
      // Wait for booking content to appear
      console.log('Looking for booking content...');
      try {
        await this.page.waitForFunction(
          () => {
            const text = document.body.innerText.toLowerCase();
            const hasBookingText = text.includes('booking') || text.includes('reservation') || text.includes('room');
            const hasBookingElements = document.querySelectorAll('[class*="booking"], [class*="reservation"], [class*="room"]').length > 0;
            const notLoading = !text.includes('loading');
            return (hasBookingText || hasBookingElements) && notLoading;
          },
          { timeout: 20000 }
        );
        console.log('Booking content found!');
      } catch (error) {
        console.log('No specific booking content detected, proceeding with full page...');
      }

      // Get the full page HTML after it's loaded
      const html = await this.page.content();
      console.log(`Page HTML captured (${html.length} characters), sending to LLM for parsing...`);
      
      return html;
      
    } catch (error) {
      console.error('Error scraping bookings:', error.message);
      console.log('Current URL:', this.page.url());
      throw error;
    }
  }

  async close() {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close();
      }
      console.log('Browser closed successfully');
    } catch (error) {
      console.warn('Error closing browser:', error.message);
      // Force kill any remaining processes
      try {
        if (this.browser) {
          this.browser.process()?.kill('SIGKILL');
        }
      } catch (killError) {
        console.warn('Error force-killing browser:', killError.message);
      }
    }
  }
}

async function main() {
  // Check for required environment variables
  if (!process.env.LUCID_EMAIL) {
    console.error('Error: LUCID_EMAIL environment variable is required');
    console.log('Please set your email in the .env file or environment variables');
    process.exit(1);
  }
  
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY environment variable is required');
    console.log('Please set your OpenRouter API key in the .env file or environment variables');
    process.exit(1);
  }

  let scraper = null;
  
  try {
    scraper = new LucidScraper();
    
    // Add cleanup handlers
    const cleanup = async () => {
      if (scraper) {
        console.log('\nCleaning up browser...');
        await scraper.close();
      }
    };
    
    process.on('SIGINT', async () => {
      await cleanup();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      await cleanup();
      process.exit(0);
    });
    
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      await cleanup();
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      await cleanup();
      process.exit(1);
    });
    
    // Initialize browser with retry logic
    let initRetries = 3;
    while (initRetries > 0) {
      try {
        await scraper.init();
        break;
      } catch (error) {
        initRetries--;
        if (initRetries === 0) {
          throw error;
        }
        console.log(`Browser init failed, retrying... (${initRetries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    await scraper.login();
    const html = await scraper.scrapeBookings();
    
    // Parse bookings with LLM
    const bookings = await parseBookingsWithLLM(html);
    
    // Save to JSON file
    const dataPath = path.join(__dirname, '../../data/bookings.json');
    await fs.ensureDir(path.dirname(dataPath));
    await fs.writeJson(dataPath, { 
      bookings, 
      lastUpdated: new Date().toISOString() 
    }, { spaces: 2 });
    
    console.log(`Successfully scraped ${bookings.length} bookings and saved to ${dataPath}`);
    
  } catch (error) {
    if (error.message && error.message.includes('MANUAL_LOGIN_REQUIRED')) {
      // Manual login required - this is expected
      console.log('\n' + error.message.replace('MANUAL_LOGIN_REQUIRED: ', ''));
      process.exit(0); // Exit successfully since user needs to complete login manually
    } else {
      console.error('Scraping failed:', error.message);
      
      if (error.message && (error.message.includes('socket hang up') || 
                           error.message.includes('ECONNRESET') ||
                           error.message.includes('Target closed') ||
                           error.message.includes('Protocol error'))) {
        console.log('\n🔧 Browser connection issue detected. Troubleshooting tips:');
        console.log('1. Kill existing Chrome processes: pkill -f chrome');
        console.log('2. Check available memory: Activity Monitor');
        console.log('3. Close other browser instances');
        console.log('4. Try restarting your machine if issues persist');
      }
      process.exit(1);
    }
  } finally {
    if (scraper) {
      await scraper.close();
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { LucidScraper };
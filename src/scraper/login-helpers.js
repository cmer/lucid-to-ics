// Login process helper functions

const path = require('path');
const fs = require('fs-extra');
const { TIMEOUTS, PATHS, URLS } = require('../config/constants');
const { createLogger } = require('../utils/logger');

const logger = createLogger('LOGIN');

/**
 * Find email input field on the page
 */
async function findEmailInput(page) {
  logger.debug('Looking for email input field');
  
  return await page.evaluate(() => {
    const emailSelectors = [
      'input[type="email"]',
      'input[name*="email"]',
      'input[id*="email"]',
      'input[placeholder*="email"]',
      'input[autocomplete*="email"]'
    ];
    
    for (const selector of emailSelectors) {
      const input = document.querySelector(selector);
      if (input) {
        return { selector, found: true };
      }
    }
    return { selector: null, found: false };
  });
}

/**
 * Submit email form and handle validation
 */
async function submitEmailForm(page, email, emailSelector) {
  logger.progress('Submitting email form');
  
  // Clear and type email
  await page.focus(emailSelector);
  await page.keyboard.selectAll();
  await page.type(emailSelector, email);
  
  // Trigger validation events
  await page.evaluate((selector) => {
    const input = document.querySelector(selector);
    if (input) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, emailSelector);
  
  // Wait for button to become enabled
  await page.waitForTimeout(1000);
  
  // Find and click submit button
  const submitButton = await page.evaluate(() => {
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Send")',
      'button:contains("Continue")',
      'button:contains("Sign")',
      '.btn-primary',
      '.submit-btn'
    ];
    
    for (const selector of buttonSelectors) {
      const button = document.querySelector(selector);
      if (button && !button.disabled) {
        return selector;
      }
    }
    return null;
  });
  
  if (!submitButton) {
    throw new Error('Could not find enabled submit button');
  }
  
  await page.click(submitButton);
  logger.info('Email form submitted successfully');
}

/**
 * Check if magic link URL exists and is valid
 */
async function checkMagicLinkUrl() {
  logger.debug('Checking for magic link URL');
  
  const loginUrlFile = path.join(__dirname, '../../', PATHS.LOGIN_URL_FILE);
  
  if (await fs.pathExists(loginUrlFile)) {
    const url = await fs.readFile(loginUrlFile, 'utf8');
    if (url && url.trim().startsWith('http')) {
      logger.success('Found valid magic link URL');
      return url.trim();
    }
  }
  
  logger.debug('No valid magic link URL found');
  return null;
}

/**
 * Wait for magic link URL to be provided
 */
async function waitForMagicLink() {
  logger.info('Waiting for magic link URL...');
  logger.info('Please paste the magic link URL at: http://localhost:3000/login');
  
  const startTime = Date.now();
  const timeout = TIMEOUTS.MAGIC_LINK_WAIT;
  
  while (Date.now() - startTime < timeout) {
    const url = await checkMagicLinkUrl();
    if (url) {
      return url;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Magic link URL not provided within timeout period');
}

/**
 * Navigate to magic link and complete authentication
 */
async function processMagicLink(page, magicLinkUrl) {
  logger.progress('Processing magic link authentication');
  
  try {
    // Navigate to the magic link
    await page.goto(magicLinkUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.PAGE_NAVIGATION
    });
    
    logger.info('Navigated to magic link URL');
    
    // Wait for redirect/authentication to complete
    await page.waitForTimeout(TIMEOUTS.FORM_SUBMIT_WAIT);
    
    // Check if we're now logged in
    const currentUrl = page.url();
    logger.debug('Current URL after magic link', { url: currentUrl });
    
    if (currentUrl.includes('/account') || currentUrl.includes('/dashboard')) {
      logger.success('Magic link authentication successful');
      return true;
    }
    
    // Wait a bit more for potential redirects
    await page.waitForTimeout(5000);
    const finalUrl = page.url();
    
    if (finalUrl.includes('/account') || finalUrl.includes('/dashboard')) {
      logger.success('Magic link authentication successful after redirect');
      return true;
    }
    
    logger.warn('Magic link may not have worked', { finalUrl });
    return false;
    
  } catch (error) {
    logger.error('Error processing magic link', error);
    throw error;
  }
}

/**
 * Clean up the magic link URL file after use
 */
async function cleanupMagicLink() {
  logger.debug('Cleaning up magic link URL file');
  
  const loginUrlFile = path.join(__dirname, '../../', PATHS.LOGIN_URL_FILE);
  
  try {
    if (await fs.pathExists(loginUrlFile)) {
      await fs.remove(loginUrlFile);
      logger.debug('Magic link URL file removed');
    }
  } catch (error) {
    logger.warn('Could not remove magic link URL file', error);
  }
}

/**
 * Verify login status by checking page content
 */
async function verifyLoginStatus(page) {
  logger.debug('Verifying login status');
  
  try {
    const loginCheck = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      const hasSignIn = bodyText.includes('sign in') || bodyText.includes('log in');
      const hasEmail = bodyText.includes('email');
      const hasBookingContent = bodyText.includes('booking') || 
                               bodyText.includes('reservation') || 
                               bodyText.includes('account');
      
      return {
        hasSignIn,
        hasEmail,
        hasBookingContent,
        currentUrl: window.location.href
      };
    });
    
    logger.debug('Login check results', loginCheck);
    
    // If we're on an account page with booking content and no sign-in prompts, we're logged in
    if (loginCheck.currentUrl.includes('/account') && loginCheck.hasBookingContent && !loginCheck.hasSignIn) {
      logger.success('User appears to be logged in');
      return true;
    }
    
    // Alternative check: if we have booking content but no sign-in prompts
    if (loginCheck.hasBookingContent && !loginCheck.hasSignIn) {
      logger.success('User appears to be logged in (booking content found)');
      return true;
    }
    
    logger.info('User appears to need authentication', loginCheck);
    return false;
    
  } catch (error) {
    logger.error('Error verifying login status', error);
    return false;
  }
}

module.exports = {
  findEmailInput,
  submitEmailForm,
  checkMagicLinkUrl,
  waitForMagicLink,
  processMagicLink,
  cleanupMagicLink,
  verifyLoginStatus
};
// Booking section extraction strategies

const { BOOKING_SEARCH_TERMS, BOOKING_SELECTORS, MAIN_CONTENT_SELECTORS, THRESHOLDS } = require('../config/constants');
const { createLogger } = require('../utils/logger');

const logger = createLogger('EXTRACTION');

/**
 * Strategy 1: Find elements by text content
 */
async function findByTextContent(page) {
  logger.debug('Trying text content strategy');
  
  return await page.evaluate((searchTerms) => {
    for (const term of searchTerms) {
      const elements = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent && 
        el.textContent.toLowerCase().includes(term) && 
        el.children.length > 0 // Has child elements (likely a container)
      );
      
      if (elements.length > 0) {
        // Find the most likely container (largest one with booking-like content)
        const container = elements.reduce((largest, current) => 
          current.innerHTML.length > largest.innerHTML.length ? current : largest
        );
        
        console.log(`Found bookings container via text "${term}":`, container.tagName, container.className);
        return {
          html: container.outerHTML,
          method: `text-search-${term}`,
          size: container.outerHTML.length
        };
      }
    }
    return null;
  }, BOOKING_SEARCH_TERMS);
}

/**
 * Strategy 2: Look for common booking UI patterns
 */
async function findBySelectors(page) {
  logger.debug('Trying CSS selector strategy');
  
  return await page.evaluate((selectors, minSize) => {
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Find the container with the most content
        let bestElement = null;
        let maxSize = 0;
        
        elements.forEach(el => {
          const size = el.innerHTML.length;
          if (size > maxSize) {
            maxSize = size;
            bestElement = el;
          }
        });
        
        if (bestElement && maxSize > minSize) {
          console.log(`Found bookings container via selector "${selector}":`, bestElement.tagName, bestElement.className);
          return {
            html: bestElement.outerHTML,
            method: `selector-${selector}`,
            size: bestElement.outerHTML.length
          };
        }
      }
    }
    return null;
  }, BOOKING_SELECTORS, THRESHOLDS.MIN_BOOKING_SECTION_SIZE);
}

/**
 * Strategy 3: Look for main content area (fallback)
 */
async function findMainContent(page) {
  logger.debug('Trying main content strategy');
  
  return await page.evaluate((mainSelectors, minSize) => {
    for (const selector of mainSelectors) {
      const element = document.querySelector(selector);
      if (element && element.innerHTML.length > minSize) {
        console.log(`Using main content area as fallback:`, selector);
        return {
          html: element.outerHTML,
          method: `main-content-${selector}`,
          size: element.outerHTML.length
        };
      }
    }
    return null;
  }, MAIN_CONTENT_SELECTORS, THRESHOLDS.MIN_MAIN_CONTENT_SIZE);
}

/**
 * Clean extracted HTML by removing scripts, styles, and comments
 */
async function cleanHtml(page, html) {
  logger.debug('Cleaning extracted HTML');
  
  return await page.evaluate((html) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Remove script tags
    tempDiv.querySelectorAll('script').forEach(el => el.remove());
    
    // Remove style tags  
    tempDiv.querySelectorAll('style').forEach(el => el.remove());
    
    // Remove comment nodes
    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_COMMENT);
    const comments = [];
    let node;
    while (node = walker.nextNode()) {
      comments.push(node);
    }
    comments.forEach(comment => comment.remove());
    
    return tempDiv.innerHTML;
  }, html);
}

/**
 * Extract bookings section using multiple strategies
 */
async function extractBookingsSection(page) {
  logger.progress('Extracting bookings section from page');
  
  try {
    const strategies = [
      findByTextContent,
      findBySelectors,
      findMainContent
    ];
    
    for (const strategy of strategies) {
      const result = await strategy(page);
      if (result) {
        logger.success(`Extracted bookings section using method: ${result.method}`, {
          originalSize: result.size
        });
        
        // Clean the HTML
        const cleanedHtml = await cleanHtml(page, result.html);
        
        logger.info(`HTML cleaned`, {
          originalSize: result.size,
          cleanedSize: cleanedHtml.length,
          reduction: `${(((result.size - cleanedHtml.length) / result.size) * 100).toFixed(1)}%`
        });
        
        return {
          html: cleanedHtml,
          method: result.method,
          originalSize: result.size,
          cleanedSize: cleanedHtml.length
        };
      }
    }
    
    logger.warn('No specific bookings section found with any strategy');
    return null;
    
  } catch (error) {
    logger.error('Error extracting bookings section', error);
    return null;
  }
}

module.exports = {
  extractBookingsSection,
  findByTextContent,
  findBySelectors, 
  findMainContent,
  cleanHtml
};
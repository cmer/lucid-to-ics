const axios = require('axios');
const { LLM } = require('../config/constants');
const { llmLogger: logger } = require('../utils/logger');

async function parseBookingsWithLLM(html) {
  if (!process.env.OPENROUTER_API_KEY) {
    const error = new Error('OPENROUTER_API_KEY environment variable is required');
    logger.error('Missing API key', error);
    throw error;
  }
  
  logger.progress(`Parsing HTML content with LLM (${html.length} characters)`);

  const prompt = `
You are tasked with extracting room booking information from HTML content. 
Parse the HTML and extract all booking/reservation data into a JSON array.

For each booking, extract:
- title: The booking/event title or description
- room: The room name or location
- date: The date in YYYY-MM-DD format
- startTime: Start time in HH:MM format (24-hour)
- endTime: End time in HH:MM format (24-hour)
- description: Any additional details about the booking

Return ONLY a valid JSON array of booking objects. If no bookings are found, return an empty array [].

HTML content to parse:
${html}
`;

  try {
    const model = process.env.LLM_MODEL || LLM.DEFAULT_MODEL;
    logger.debug('Using LLM model', { model });
    
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: LLM.MAX_TOKENS,
      temperature: LLM.TEMPERATURE
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/your-username/lucid-to-ics',
        'X-Title': 'Lucid Bookings Scraper'
      }
    });

    const content = response.data.choices[0].message.content.trim();
    logger.debug('LLM response received', { contentLength: content.length });
    
    // Extract JSON from the response (in case there's extra text)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('No JSON array found in LLM response', { content: content.substring(0, 200) + '...' });
      return [];
    }

    const bookings = JSON.parse(jsonMatch[0]);
    logger.success(`LLM parsed ${bookings.length} bookings successfully`);
    
    return bookings;
    
  } catch (error) {
    if (error.response) {
      logger.error('OpenRouter API error', {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.name === 'SyntaxError') {
      logger.error('Failed to parse LLM response as JSON', error);
    } else {
      logger.error('Error calling LLM API', error);
    }
    
    // Return empty array on error rather than crashing
    return [];
  }
}

module.exports = { parseBookingsWithLLM };
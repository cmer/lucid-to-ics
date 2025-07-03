const axios = require('axios');

async function parseBookingsWithLLM(html) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

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
    const model = process.env.LLM_MODEL || 'openai/gpt-4o-mini';
    
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.1
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/your-username/lucid-to-ics',
        'X-Title': 'Lucid Bookings Scraper'
      }
    });

    const content = response.data.choices[0].message.content.trim();
    
    // Extract JSON from the response (in case there's extra text)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in LLM response:', content);
      return [];
    }

    const bookings = JSON.parse(jsonMatch[0]);
    console.log(`LLM parsed ${bookings.length} bookings`);
    
    return bookings;
    
  } catch (error) {
    if (error.response) {
      console.error('OpenRouter API error:', error.response.status, error.response.data);
    } else if (error.name === 'SyntaxError') {
      console.error('Failed to parse LLM response as JSON:', error.message);
    } else {
      console.error('Error calling LLM API:', error.message);
    }
    
    // Return empty array on error rather than crashing
    return [];
  }
}

module.exports = { parseBookingsWithLLM };
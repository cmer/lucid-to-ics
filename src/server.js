const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { handleCalendarRequest } = require('./api/calendar');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'Lucid Private Offices ICS Server',
    endpoints: {
      calendar: '/calendar.ics',
      login: '/login',
      health: '/'
    }
  });
});

// Login form for pasting magic link URL
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lucid Login - Paste Magic Link</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                background: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
                color: #333;
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 8px;
                font-weight: 500;
                color: #555;
            }
            input[type="url"] {
                width: 100%;
                padding: 12px;
                border: 2px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
                margin-bottom: 20px;
                box-sizing: border-box;
            }
            button {
                background: #007cba;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 500;
            }
            button:hover {
                background: #005a87;
            }
            .status {
                margin-top: 20px;
                padding: 10px;
                border-radius: 4px;
                display: none;
            }
            .success {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            .error {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            .instructions {
                background: #e7f3ff;
                border: 1px solid #b8daff;
                color: #004085;
                padding: 15px;
                border-radius: 4px;
                margin-bottom: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔗 Lucid Private Offices Login</h1>
            
            <div class="instructions">
                <strong>Instructions:</strong>
                <ol>
                    <li>Check your email for the magic link from Lucid Private Offices</li>
                    <li>Copy the entire URL from the email</li>
                    <li>Paste it in the field below and click "Submit"</li>
                    <li>The scraper will automatically use this URL to complete login</li>
                </ol>
            </div>

            <form id="loginForm" onsubmit="submitUrl(event)">
                <label for="loginUrl">Magic Link URL:</label>
                <input 
                    type="url" 
                    id="loginUrl" 
                    name="loginUrl" 
                    placeholder="https://my.lucidprivateoffices.com/auth/..." 
                    required
                >
                <button type="submit">Submit Login URL</button>
            </form>

            <div id="status" class="status"></div>
        </div>

        <script>
            async function submitUrl(event) {
                event.preventDefault();
                
                const url = document.getElementById('loginUrl').value;
                const statusDiv = document.getElementById('status');
                
                try {
                    const response = await fetch('/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ loginUrl: url })
                    });
                    
                    const result = await response.json();
                    
                    if (response.ok) {
                        statusDiv.className = 'status success';
                        statusDiv.textContent = '✅ Login URL saved! The scraper will use this URL to complete authentication.';
                        statusDiv.style.display = 'block';
                        document.getElementById('loginForm').reset();
                    } else {
                        throw new Error(result.error || 'Failed to save URL');
                    }
                } catch (error) {
                    statusDiv.className = 'status error';
                    statusDiv.textContent = '❌ Error: ' + error.message;
                    statusDiv.style.display = 'block';
                }
            }
        </script>
    </body>
    </html>
  `);
});

// Handle login URL submission
app.post('/login', async (req, res) => {
  try {
    const { loginUrl } = req.body;
    
    if (!loginUrl || !loginUrl.startsWith('http')) {
      return res.status(400).json({ error: 'Invalid URL provided' });
    }
    
    // Save the URL to file for the scraper to pick up
    const loginUrlFile = path.join(__dirname, '../login_url.txt');
    await fs.writeFile(loginUrlFile, loginUrl);
    
    console.log('📨 Login URL received and saved');
    
    res.json({ 
      success: true, 
      message: 'Login URL saved successfully. The scraper will use this to authenticate.' 
    });
    
  } catch (error) {
    console.error('Error saving login URL:', error);
    res.status(500).json({ error: 'Failed to save login URL' });
  }
});

// Calendar ICS endpoint
app.get('/calendar.ics', handleCalendarRequest);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Lucid ICS Server running on port ${PORT}`);
  console.log(`📅 Calendar endpoint: http://localhost:${PORT}/calendar.ics`);
  console.log(`🔗 Login form: http://localhost:${PORT}/login`);
  console.log(`💡 Run 'npm run scrape' to update bookings data`);
});

module.exports = app;
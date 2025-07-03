const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { handleCalendarRequest } = require('./api/calendar');
const { PATHS, SERVER } = require('./config/constants');
const { serverLogger: logger } = require('./utils/logger');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || SERVER.DEFAULT_PORT;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Basic Authentication middleware
const httpAuth = (req, res, next) => {
  const authUser = process.env.HTTP_AUTH_USER;
  const authPassword = process.env.HTTP_AUTH_PASSWORD;
  
  // Skip auth if username not configured
  if (!authUser) {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Lucid ICS Server"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  
  // Check username (always required)
  if (username !== authUser) {
    res.set('WWW-Authenticate', 'Basic realm="Lucid ICS Server"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Check password only if one is configured
  if (authPassword && password !== authPassword) {
    res.set('WWW-Authenticate', 'Basic realm="Lucid ICS Server"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  next();
};

// Apply authentication to all routes
app.use(httpAuth);

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
app.get('/login', async (req, res) => {
  try {
    const loginFormPath = path.join(__dirname, 'templates/login-form.html');
    const htmlContent = await fs.readFile(loginFormPath, 'utf-8');
    res.send(htmlContent);
  } catch (error) {
    logger.error('Error loading login form template', error);
    res.status(500).send('Error loading login form');
  }
});


// Handle login URL submission
app.post('/login', async (req, res) => {
  try {
    const { loginUrl } = req.body;
    
    if (!loginUrl || !loginUrl.startsWith('http')) {
      logger.warn('Invalid URL provided in login request', { loginUrl });
      return res.status(400).json({ error: 'Invalid URL provided' });
    }
    
    // Save the URL to file for the scraper to pick up
    const loginUrlFile = path.join(__dirname, '../', PATHS.LOGIN_URL_FILE);
    await fs.writeFile(loginUrlFile, loginUrl);
    
    logger.success('Login URL received and saved');
    
    res.json({ 
      success: true, 
      message: 'Login URL saved successfully. The scraper will use this to authenticate.' 
    });
    
  } catch (error) {
    logger.error('Error saving login URL', error);
    res.status(500).json({ error: 'Failed to save login URL' });
  }
});

// Calendar ICS endpoint
app.get('/calendar.ics', handleCalendarRequest);

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Server error', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  logger.warn('404 - Endpoint not found', { url: req.url, method: req.method });
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  logger.success(`Lucid ICS Server running on port ${PORT}`);
  logger.info('Available endpoints:', {
    calendar: `http://localhost:${PORT}/calendar.ics`,
    login: `http://localhost:${PORT}/login`,
    health: `http://localhost:${PORT}/`
  });
  logger.info('💡 Run \'npm run scrape\' to update bookings data');
});

module.exports = app;
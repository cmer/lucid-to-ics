const fs = require('fs-extra');
const path = require('path');
const ical = require('ical-generator');
const { PATHS } = require('../config/constants');
const { calendarLogger: logger } = require('../utils/logger');

function generateICS(bookings) {
  const cal = ical.default({
    name: 'Lucid Private Offices Bookings',
    description: 'Room bookings from Lucid Private Offices',
    timezone: 'America/New_York' // Adjust as needed
  });

  bookings.forEach((booking, index) => {
    cal.createEvent({
      uid: `lucid-booking-${index}-${Date.now()}@lucid-to-ics`,
      start: new Date(`${booking.date}T${booking.startTime}:00`),
      end: new Date(`${booking.date}T${booking.endTime}:00`),
      summary: booking.title || 'Room Booking',
      description: booking.description || '',
      location: booking.room || '',
      created: new Date(),
      lastModified: new Date()
    });
  });

  return cal.toString();
}

async function getBookingsData() {
  const dataPath = path.join(__dirname, '../../', PATHS.BOOKINGS_DATA);
  
  try {
    if (await fs.pathExists(dataPath)) {
      const data = await fs.readJson(dataPath);
      logger.debug(`Loaded ${data.bookings?.length || 0} bookings from data file`);
      return data.bookings || [];
    }
    logger.warn('Bookings data file does not exist');
  } catch (error) {
    logger.error('Error reading bookings data', error);
  }
  
  return [];
}

async function handleCalendarRequest(req, res) {
  try {
    logger.progress('Calendar request received');
    const bookings = await getBookingsData();
    logger.info(`Generating calendar for ${bookings.length} bookings`);
    
    const icsContent = generateICS(bookings);
    
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lucid-bookings.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    logger.success('Calendar generated successfully');
    res.send(icsContent);
    
  } catch (error) {
    logger.error('Error generating calendar', error);
    
    // Still try to return a basic empty calendar instead of erroring
    try {
      logger.warn('Attempting to generate empty calendar as fallback');
      const emptyCalendar = generateICS([]);
      res.set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="lucid-bookings.ics"'
      });
      res.send(emptyCalendar);
    } catch (fallbackError) {
      logger.error('Even fallback calendar generation failed', fallbackError);
      res.status(500).json({ error: 'Failed to generate calendar' });
    }
  }
}

module.exports = { handleCalendarRequest, generateICS, getBookingsData };
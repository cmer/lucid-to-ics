const fs = require('fs-extra');
const path = require('path');
const ical = require('ical-generator');

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
  const dataPath = path.join(__dirname, '../../data/bookings.json');
  
  try {
    if (await fs.pathExists(dataPath)) {
      const data = await fs.readJson(dataPath);
      return data.bookings || [];
    }
  } catch (error) {
    console.error('Error reading bookings data:', error.message);
  }
  
  return [];
}

async function handleCalendarRequest(req, res) {
  try {
    const bookings = await getBookingsData();
    console.log(`Generating calendar for ${bookings.length} bookings`);
    
    const icsContent = generateICS(bookings);
    
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lucid-bookings.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.send(icsContent);
    
  } catch (error) {
    console.error('Error generating calendar:', error);
    console.error('Error stack:', error.stack);
    
    // Still try to return a basic empty calendar instead of erroring
    try {
      const emptyCalendar = generateICS([]);
      res.set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="lucid-bookings.ics"'
      });
      res.send(emptyCalendar);
    } catch (fallbackError) {
      console.error('Even fallback calendar generation failed:', fallbackError);
      res.status(500).json({ error: 'Failed to generate calendar' });
    }
  }
}

module.exports = { handleCalendarRequest, generateICS, getBookingsData };
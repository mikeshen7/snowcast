'use strict';

const mongoose = require('mongoose');
require('dotenv').config();
const Location = require('./locationsDb');

const { config } = require('../config');
const databaseName = config.db.name;

// Current production snapshot (2025-12-18)
const seedLocations = [
  { name: 'Beaver Creek Resort', country: 'United States', region: 'Colorado', lat: 39.60180753515927, lon: -106.53155755995299, tz_iana: 'America/Boise', isSkiResort: true },
  { name: 'Bellevue', country: 'United States', region: 'Washington', lat: 47.60982821170767, lon: -122.19982508487432, tz_iana: 'America/Los_Angeles', isSkiResort: false },
  { name: 'Breckenridge Ski Resort', country: 'United States', region: 'Colorado', lat: 39.48058533715974, lon: -106.0739308056387, tz_iana: 'America/Los_Angeles', isSkiResort: true },
  { name: 'Crested Butte Mountain Resort', country: 'United States', region: 'Colorado', lat: 38.89921621240083, lon: -106.96602763452617, tz_iana: 'America/Boise', isSkiResort: true },
  { name: 'Crystal Mountain Resort', country: 'United States', region: 'Washington', lat: 46.93582721593556, lon: -121.47472557121058, tz_iana: 'America/Los_Angeles', isSkiResort: true },
  { name: 'Keystone Resort', country: 'United States', region: 'Colorado', lat: 39.58271804395299, lon: -105.94395521335885, tz_iana: 'America/Boise', isSkiResort: true },
  { name: 'Kirkland', country: 'United States', region: 'Washington', lat: 47.6767815493646, lon: -122.20455560291758, tz_iana: 'America/Los_Angeles', isSkiResort: false },
  { name: 'Park City Ski Resort', country: 'United States', region: 'Utah', lat: 40.66166156005567, lon: -111.545945422022818, tz_iana: 'America/Boise', isSkiResort: true },
  { name: 'Seattle', country: 'United States', region: 'Washington', lat: 47.60626032173439, lon: -122.33320221561831, tz_iana: 'America/Los_Angeles', isSkiResort: false },
  { name: 'Stevens Pass', country: 'United States', region: 'Washington', lat: 47.746408778169496, lon: -121.08910822524726, tz_iana: 'America/Los_Angeles', isSkiResort: true },
  { name: 'Summit at Snoqualmie', country: 'United States', region: 'Washington', lat: 47.42471625304692, lon: -121.41642693098201, tz_iana: 'America/Los_Angeles', isSkiResort: true },
  { name: 'Vail Ski Resort', country: 'United States', region: 'Colorado', lat: 39.60923961318908, lon: -106.35427523296126, tz_iana: 'America/Denver', isSkiResort: true },
  { name: 'Whistler', country: 'Canada', region: 'British Columbia', lat: 50.11267073043241, lon: -122.95447652777622, tz_iana: 'America/Los_Angeles', isSkiResort: true },
];

async function seed() {
  try {
    await mongoose.connect(`${config.db.url}${databaseName}?retryWrites=true&w=majority`);
    console.log('Connected');

    const ops = seedLocations.map((loc) => ({
      updateOne: {
        filter: { lat: loc.lat, lon: loc.lon },
        update: { $setOnInsert: loc },
        upsert: true,
      },
    }));

    const result = await Location.bulkWrite(ops, { ordered: false });
    console.log(`Upserted ${result.upsertedCount || 0} locations.`);
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

seed();

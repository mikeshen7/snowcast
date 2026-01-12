'use strict';

const mongoose = require('mongoose');
require('dotenv').config();
const Location = require('./locationsDb');

const { config } = require('../config');
const databaseName = config.db.name;

// Seed locations from Locations.xlsx (2026-01-11)
const seedLocations = [
  { name: 'Alta', country: 'United States', region: 'Utah', lat: 40.588, lon: -111.6378, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 8530, midElevationFt: 9799, topElevationFt: 11068 },
  { name: 'Arapahoe Basin', country: 'United States', region: 'Colorado', lat: 39.6423, lon: -105.8717, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 10520, midElevationFt: 11785, topElevationFt: 13050 },
  { name: 'Aspen Snowmass', country: 'United States', region: 'Colorado', lat: 39.2078, lon: -106.9475, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 8104, midElevationFt: 10305, topElevationFt: 12510 },
  { name: 'Baker', country: 'United States', region: 'Washington', lat: 48.855, lon: -121.673, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 3500, midElevationFt: 4295, topElevationFt: 5089 },
  { name: 'Banff Sunshine', country: 'Canada', region: 'Alberta', lat: 51.1133, lon: -115.7633, tz_iana: 'America/Edmonton', isSkiResort: true, baseElevationFt: 5450, midElevationFt: 7090, topElevationFt: 8960 },
  { name: 'Beaver Creek', country: 'United States', region: 'Colorado', lat: 39.6042, lon: -106.5165, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 7400, midElevationFt: 9425, topElevationFt: 11440 },
  { name: 'Big Sky', country: 'United States', region: 'Montana', lat: 45.285, lon: -111.4003, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6800, midElevationFt: 8983, topElevationFt: 11166 },
  { name: 'Breckenridge', country: 'United States', region: 'Colorado', lat: 39.4817, lon: -106.0661, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9600, midElevationFt: 11220, topElevationFt: 12840 },
  { name: 'Copper Mountain', country: 'United States', region: 'Colorado', lat: 39.5017, lon: -106.1565, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9712, midElevationFt: 11077, topElevationFt: 12441 },
  { name: 'Crested Butte', country: 'United States', region: 'Colorado', lat: 38.8997, lon: -106.9664, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9375, midElevationFt: 10405, topElevationFt: 12447 },
  { name: 'Crystal Mountain', country: 'United States', region: 'Washington', lat: 46.9353, lon: -121.4748, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 4400, midElevationFt: 5706, topElevationFt: 7002 },
  { name: 'Deer Valley', country: 'United States', region: 'Utah', lat: 40.6373, lon: -111.4783, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6570, midElevationFt: 8070, topElevationFt: 9570 },
  { name: 'Heavenly', country: 'United States', region: 'California', lat: 38.935, lon: -119.9403, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 6540, midElevationFt: 8310, topElevationFt: 10040 },
  { name: 'Jackson Hole', country: 'United States', region: 'Wyoming', lat: 43.5875, lon: -110.8278, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6311, midElevationFt: 8381, topElevationFt: 10450 },
  { name: 'Keystone', country: 'United States', region: 'Colorado', lat: 39.5792, lon: -105.9342, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9280, midElevationFt: 10640, topElevationFt: 12000 },
  { name: 'Kirkwood', country: 'United States', region: 'California', lat: 38.6844, lon: -120.0642, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 7800, midElevationFt: 8800, topElevationFt: 9800 },
  { name: 'Lake Louise', country: 'Canada', region: 'Alberta', lat: 51.4253, lon: -116.1772, tz_iana: 'America/Edmonton', isSkiResort: true, baseElevationFt: 5400, midElevationFt: 7025, topElevationFt: 8650 },
  { name: 'Mammoth', country: 'United States', region: 'California', lat: 37.6308, lon: -119.0325, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 7953, midElevationFt: 9503, topElevationFt: 11053 },
  { name: 'Mission Ridge', country: 'United States', region: 'Washington', lat: 47.2883, lon: -120.3927, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 4570, midElevationFt: 5695, topElevationFt: 6820 },
  { name: 'Northstar', country: 'United States', region: 'California', lat: 39.2733, lon: -120.1217, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 6330, midElevationFt: 7475, topElevationFt: 8610 },
  { name: 'Palisades Tahoe', country: 'United States', region: 'California', lat: 39.1967, lon: -120.2356, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 6200, midElevationFt: 7600, topElevationFt: 9050 },
  { name: 'Park City', country: 'United States', region: 'Utah', lat: 40.6512, lon: -111.5081, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6800, midElevationFt: 8412, topElevationFt: 10026 },
  { name: 'Powder Mountain', country: 'United States', region: 'Utah', lat: 41.3808, lon: -111.7644, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6900, midElevationFt: 8161, topElevationFt: 9422 },
  { name: 'Revelstoke', country: 'Canada', region: 'British Columbia', lat: 50.8983, lon: -118.1961, tz_iana: 'America/Vancouver', isSkiResort: true, baseElevationFt: 1680, midElevationFt: 5100, topElevationFt: 7300 },
  { name: 'Schweitzer', country: 'United States', region: 'Idaho', lat: 48.3619, lon: -116.6233, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 4000, midElevationFt: 5200, topElevationFt: 6400 },
  { name: 'Snoqualmie', country: 'United States', region: 'Washington', lat: 47.424, lon: -121.418, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 3202, midElevationFt: 4301, topElevationFt: 5400 },
  { name: 'Snowbird', country: 'United States', region: 'Utah', lat: 40.5833, lon: -111.6572, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 7760, midElevationFt: 9380, topElevationFt: 11000 },
  { name: 'Steamboat', country: 'United States', region: 'Colorado', lat: 40.4583, lon: -106.7958, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6900, midElevationFt: 8735, topElevationFt: 10568 },
  { name: 'Stevens Pass', country: 'United States', region: 'Washington', lat: 47.7402, lon: -121.0867, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 4061, midElevationFt: 4953, topElevationFt: 5845 },
  { name: 'Sun Peaks', country: 'Canada', region: 'British Columbia', lat: 50.88, lon: -119.885, tz_iana: 'America/Vancouver', isSkiResort: true, baseElevationFt: 3920, midElevationFt: 5370, topElevationFt: 6820 },
  { name: 'Sun Valley', country: 'United States', region: 'Idaho', lat: 43.6963, lon: -114.3542, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 5750, midElevationFt: 7425, topElevationFt: 9150 },
  { name: 'Telluride', country: 'United States', region: 'Colorado', lat: 37.9129, lon: -107.8382, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 8725, midElevationFt: 10648, topElevationFt: 12570 },
  { name: 'Timberline Lodge', country: 'United States', region: 'Oregon', lat: 45.3312, lon: -121.7112, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 6000, midElevationFt: 7270, topElevationFt: 8540 },
  { name: 'Vail', country: 'United States', region: 'Colorado', lat: 39.6061, lon: -106.355, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 8120, midElevationFt: 9800, topElevationFt: 11480 },
  { name: 'Whistler Blackcomb', country: 'Canada', region: 'British Columbia', lat: 50.1164, lon: -122.9548, tz_iana: 'America/Vancouver', isSkiResort: true, baseElevationFt: 2214, midElevationFt: 4854, topElevationFt: 7494 },
  { name: 'Winter Park', country: 'United States', region: 'Colorado', lat: 39.8868, lon: -105.7625, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9000, midElevationFt: 10527, topElevationFt: 12060 },
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

if (require.main === module) {
  seed();
}

module.exports = {
  seedLocations,
};

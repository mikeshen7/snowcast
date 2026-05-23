'use strict';

const mongoose = require('mongoose');
require('dotenv').config();
const Location = require('./locationsDb');

const { config } = require('../config');
const databaseName = config.db.name;

// Seed locations updated 2026-05-22
const MODEL_PRESETS_BY_COUNTRY = {
  'United States': ['gfs_hrrr', 'ncep_nbm_conus', 'gfs_seamless'],
  Canada: ['gem_hrdps_continental', 'gem_regional', 'gfs_seamless'],
  Japan: ['jma_msm', 'jma_gsm', 'ecmwf_ifs'],
  Switzerland: ['icon_d2', 'icon_global', 'ecmwf_ifs'],
  France: ['icon_d2', 'icon_global', 'ecmwf_ifs'],
  Austria: ['icon_d2', 'icon_global', 'ecmwf_ifs'],
  Chile: ['gfs_seamless', 'ecmwf_ifs', 'icon_global'],
  Argentina: ['gfs_seamless', 'ecmwf_ifs', 'icon_global'],
  'New Zealand': ['gfs_seamless', 'ecmwf_ifs', 'icon_global'],
  Australia: ['gfs_seamless', 'ecmwf_ifs', 'icon_global'],
};

const FAST_REFRESH_REGIONS = new Set(['Washington', 'British Columbia']);

const seedLocations = [
  { name: 'Alta', country: 'United States', region: 'Utah', lat: 40.588, lon: -111.6378, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 8530, midElevationFt: 9799, topElevationFt: 11068 },
  { name: 'Arapahoe Basin', country: 'United States', region: 'Colorado', lat: 39.6423, lon: -105.8717, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 10520, midElevationFt: 11785, topElevationFt: 13050 },
  { name: 'Aspen Snowmass', country: 'United States', region: 'Colorado', lat: 39.2078, lon: -106.9475, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 8104, midElevationFt: 10305, topElevationFt: 12510 },
  { name: 'Attitash', country: 'United States', region: 'New Hampshire', lat: 44.0814, lon: -71.2419, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 600, midElevationFt: 1475, topElevationFt: 2350 },
  { name: 'Baker', country: 'United States', region: 'Washington', lat: 48.855, lon: -121.673, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 3500, midElevationFt: 4295, topElevationFt: 5089 },
  { name: 'Banff Sunshine', country: 'Canada', region: 'Alberta', lat: 51.1133, lon: -115.7633, tz_iana: 'America/Edmonton', isSkiResort: true, baseElevationFt: 5450, midElevationFt: 7090, topElevationFt: 8960 },
  { name: 'Beaver Creek', country: 'United States', region: 'Colorado', lat: 39.6042, lon: -106.5165, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 7400, midElevationFt: 9425, topElevationFt: 11440 },
  { name: 'Big Sky', country: 'United States', region: 'Montana', lat: 45.285, lon: -111.4003, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6800, midElevationFt: 8983, topElevationFt: 11166 },
  { name: 'Breckenridge', country: 'United States', region: 'Colorado', lat: 39.4817, lon: -106.0661, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9600, midElevationFt: 11220, topElevationFt: 12840 },
  { name: 'Brighton', country: 'United States', region: 'Utah', lat: 40.5981, lon: -111.5836, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 8755, midElevationFt: 9628, topElevationFt: 10500 },
  { name: 'Cerro Catedral', country: 'Argentina', region: 'Rio Negro', lat: -41.1739, lon: -71.4325, tz_iana: 'America/Argentina/Buenos_Aires', isSkiResort: true, baseElevationFt: 3412, midElevationFt: 5151, topElevationFt: 6889 },
  { name: 'Chamonix', country: 'France', region: 'Auvergne-Rhône-Alpes', lat: 45.9237, lon: 6.8694, tz_iana: 'Europe/Paris', isSkiResort: true, baseElevationFt: 3396, midElevationFt: 7103, topElevationFt: 10810 },
  { name: 'Copper Mountain', country: 'United States', region: 'Colorado', lat: 39.5017, lon: -106.1565, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9712, midElevationFt: 11077, topElevationFt: 12441 },
  { name: 'Coronet Peak', country: 'New Zealand', region: 'Otago', lat: -45.0417, lon: 168.7125, tz_iana: 'Pacific/Auckland', isSkiResort: true, baseElevationFt: 3832, midElevationFt: 4898, topElevationFt: 5964 },
  { name: 'Crested Butte', country: 'United States', region: 'Colorado', lat: 38.8997, lon: -106.9664, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9375, midElevationFt: 10769, topElevationFt: 12162 },
  { name: 'Crystal Mountain', country: 'United States', region: 'Washington', lat: 46.9353, lon: -121.4748, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 4400, midElevationFt: 5706, topElevationFt: 7002 },
  { name: 'Deer Valley', country: 'United States', region: 'Utah', lat: 40.6373, lon: -111.4783, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6570, midElevationFt: 8070, topElevationFt: 9570 },
  { name: 'Fernie', country: 'Canada', region: 'British Columbia', lat: 49.4614, lon: -115.0869, tz_iana: 'America/Vancouver', isSkiResort: true, baseElevationFt: 3500, midElevationFt: 4908, topElevationFt: 6316 },
  { name: 'Furano', country: 'Japan', region: '北海道地方', lat: 43.265, lon: 142.375, tz_iana: 'Asia/Tokyo', isSkiResort: true, baseElevationFt: 778, midElevationFt: 2155, topElevationFt: 3530 },
  { name: 'Hakuba Valley', country: 'Japan', region: '中部地方', lat: 36.6972, lon: 137.87, tz_iana: 'Asia/Tokyo', isSkiResort: true, baseElevationFt: 2493, midElevationFt: 4252, topElevationFt: 6007 },
  { name: 'Heavenly', country: 'United States', region: 'California', lat: 38.935, lon: -119.9403, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 6540, midElevationFt: 8310, topElevationFt: 10040 },
  { name: 'Hunter Mountain', country: 'United States', region: 'New York', lat: 42.1803, lon: -74.2267, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1600, midElevationFt: 2400, topElevationFt: 3200 },
  { name: 'Jackson Hole', country: 'United States', region: 'Wyoming', lat: 43.5875, lon: -110.8278, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6311, midElevationFt: 8381, topElevationFt: 10450 },
  { name: 'Jay Peak', country: 'United States', region: 'Vermont', lat: 44.9269, lon: -72.5222, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1815, midElevationFt: 2892, topElevationFt: 3968 },
  { name: 'Keystone', country: 'United States', region: 'Colorado', lat: 39.5792, lon: -105.9342, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9280, midElevationFt: 10640, topElevationFt: 12000 },
  { name: 'Kicking Horse', country: 'Canada', region: 'British Columbia', lat: 51.2983, lon: -117.0472, tz_iana: 'America/Vancouver', isSkiResort: true, baseElevationFt: 3904, midElevationFt: 5969, topElevationFt: 8033 },
  { name: 'Killington', country: 'United States', region: 'Vermont', lat: 43.6045, lon: -72.8201, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1165, midElevationFt: 2703, topElevationFt: 4241 },
  { name: 'Kirkwood', country: 'United States', region: 'California', lat: 38.6844, lon: -120.0642, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 7800, midElevationFt: 8800, topElevationFt: 9800 },
  { name: 'Kitzbühel', country: 'Austria', region: 'Tyrol', lat: 47.4467, lon: 12.3917, tz_iana: 'Europe/Vienna', isSkiResort: true, baseElevationFt: 2625, midElevationFt: 4594, topElevationFt: 6562 },
  { name: 'Lake Louise', country: 'Canada', region: 'Alberta', lat: 51.4253, lon: -116.1772, tz_iana: 'America/Edmonton', isSkiResort: true, baseElevationFt: 5400, midElevationFt: 7025, topElevationFt: 8650 },
  { name: 'Las Leñas', country: 'Argentina', region: 'Mendoza', lat: -35.1581, lon: -70.0647, tz_iana: 'America/Argentina/Mendoza', isSkiResort: true, baseElevationFt: 7350, midElevationFt: 9302, topElevationFt: 11253 },
  { name: 'Loon Mountain', country: 'United States', region: 'New Hampshire', lat: 44.0392, lon: -71.6228, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 860, midElevationFt: 1955, topElevationFt: 3050 },
  { name: 'Mammoth', country: 'United States', region: 'California', lat: 37.6308, lon: -119.0325, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 7953, midElevationFt: 9503, topElevationFt: 11053 },
  { name: 'Mission Ridge', country: 'United States', region: 'Washington', lat: 47.2883, lon: -120.3927, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 4570, midElevationFt: 5695, topElevationFt: 6820 },
  { name: 'Mount Snow', country: 'United States', region: 'Vermont', lat: 42.9614, lon: -72.9231, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1900, midElevationFt: 2750, topElevationFt: 3600 },
  { name: 'Mt. Bachelor', country: 'United States', region: 'Oregon', lat: 43.9789, lon: -121.6872, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 5700, midElevationFt: 7383, topElevationFt: 9065 },
  { name: 'Niseko Grand Hirafu', country: 'Japan', region: '北海道地方', lat: 42.86486, lon: 140.70119, tz_iana: 'Asia/Tokyo', isSkiResort: true, baseElevationFt: 840, midElevationFt: 2316, topElevationFt: 3793 },
  { name: 'Northstar', country: 'United States', region: 'California', lat: 39.2733, lon: -120.1217, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 6330, midElevationFt: 7475, topElevationFt: 8610 },
  { name: 'Okemo', country: 'United States', region: 'Vermont', lat: 43.4018, lon: -72.7245, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1144, midElevationFt: 2244, topElevationFt: 3344 },
  { name: 'Palisades Tahoe', country: 'United States', region: 'California', lat: 39.1967, lon: -120.2356, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 6200, midElevationFt: 7600, topElevationFt: 9050 },
  { name: 'Park City', country: 'United States', region: 'Utah', lat: 40.6512, lon: -111.5081, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6800, midElevationFt: 8412, topElevationFt: 10026 },
  { name: 'Perisher', country: 'Australia', region: 'New South Wales', lat: -36.4064, lon: 148.4083, tz_iana: 'Australia/Sydney', isSkiResort: true, baseElevationFt: 5627, midElevationFt: 6183, topElevationFt: 6739 },
  { name: 'Portillo', country: 'Chile', region: 'Valparaíso', lat: -32.8344, lon: -70.1297, tz_iana: 'America/Santiago', isSkiResort: true, baseElevationFt: 8360, midElevationFt: 9610, topElevationFt: 10860 },
  { name: 'Powder Mountain', country: 'United States', region: 'Utah', lat: 41.3808, lon: -111.7644, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6900, midElevationFt: 8161, topElevationFt: 9422 },
  { name: 'Revelstoke', country: 'Canada', region: 'British Columbia', lat: 50.8983, lon: -118.1961, tz_iana: 'America/Vancouver', isSkiResort: true, baseElevationFt: 1680, midElevationFt: 5100, topElevationFt: 7300 },
  { name: 'Rusutsu', country: 'Japan', region: '北海道地方', lat: 42.7478, lon: 140.8942, tz_iana: 'Asia/Tokyo', isSkiResort: true, baseElevationFt: 1312, midElevationFt: 2287, topElevationFt: 3261 },
  { name: 'Schweitzer', country: 'United States', region: 'Idaho', lat: 48.3619, lon: -116.6233, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 4000, midElevationFt: 5200, topElevationFt: 6400 },
  { name: 'Snoqualmie', country: 'United States', region: 'Washington', lat: 47.424, lon: -121.418, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 2610, midElevationFt: 4015, topElevationFt: 5420 },
  { name: 'Snowbasin', country: 'United States', region: 'Utah', lat: 41.2159, lon: -111.8578, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6400, midElevationFt: 7875, topElevationFt: 9350 },
  { name: 'Snowbird', country: 'United States', region: 'Utah', lat: 40.5833, lon: -111.6572, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 7760, midElevationFt: 9380, topElevationFt: 11000 },
  { name: 'Solitude', country: 'United States', region: 'Utah', lat: 40.62, lon: -111.5928, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 7988, midElevationFt: 9238, topElevationFt: 10488 },
  { name: 'St. Anton', country: 'Austria', region: 'Tyrol', lat: 47.1303, lon: 10.2683, tz_iana: 'Europe/Vienna', isSkiResort: true, baseElevationFt: 4272, midElevationFt: 6747, topElevationFt: 9222 },
  { name: 'Steamboat', country: 'United States', region: 'Colorado', lat: 40.4583, lon: -106.7958, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 6900, midElevationFt: 8735, topElevationFt: 10568 },
  { name: 'Stevens Pass', country: 'United States', region: 'Washington', lat: 47.7402, lon: -121.0867, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 4061, midElevationFt: 4953, topElevationFt: 5845 },
  { name: 'Stowe', country: 'United States', region: 'Vermont', lat: 44.5303, lon: -72.7814, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1559, midElevationFt: 2592, topElevationFt: 3625 },
  { name: 'Stratton', country: 'United States', region: 'Vermont', lat: 43.1125, lon: -72.9075, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1872, midElevationFt: 2874, topElevationFt: 3875 },
  { name: 'Sugarbush', country: 'United States', region: 'Vermont', lat: 44.1373, lon: -72.9022, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1483, midElevationFt: 2783, topElevationFt: 4083 },
  { name: 'Sugarloaf', country: 'United States', region: 'Maine', lat: 45.0314, lon: -70.3131, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1417, midElevationFt: 2827, topElevationFt: 4237 },
  { name: 'Sun Peaks', country: 'Canada', region: 'British Columbia', lat: 50.88, lon: -119.885, tz_iana: 'America/Vancouver', isSkiResort: true, baseElevationFt: 3920, midElevationFt: 5370, topElevationFt: 6820 },
  { name: 'Sun Valley', country: 'United States', region: 'Idaho', lat: 43.6963, lon: -114.3542, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 5750, midElevationFt: 7425, topElevationFt: 9150 },
  { name: 'Sunday River', country: 'United States', region: 'Maine', lat: 44.4706, lon: -70.8556, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 800, midElevationFt: 1970, topElevationFt: 3140 },
  { name: 'Taos Ski Valley', country: 'United States', region: 'New Mexico', lat: 36.595, lon: -105.4508, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9207, midElevationFt: 10844, topElevationFt: 12481 },
  { name: 'Telluride', country: 'United States', region: 'Colorado', lat: 37.9129, lon: -107.8382, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 8725, midElevationFt: 10648, topElevationFt: 12570 },
  { name: 'The Remarkables', country: 'New Zealand', region: 'Otago', lat: -45.0839, lon: 168.8147, tz_iana: 'Pacific/Auckland', isSkiResort: true, baseElevationFt: 5321, midElevationFt: 5848, topElevationFt: 6375 },
  { name: 'Thredbo', country: 'Australia', region: 'New South Wales', lat: -36.5044, lon: 148.3028, tz_iana: 'Australia/Sydney', isSkiResort: true, baseElevationFt: 4478, midElevationFt: 5581, topElevationFt: 6683 },
  { name: 'Timberline Lodge', country: 'United States', region: 'Oregon', lat: 45.3312, lon: -121.7112, tz_iana: 'America/Los_Angeles', isSkiResort: true, baseElevationFt: 6000, midElevationFt: 7270, topElevationFt: 8540 },
  { name: 'Tremblant', country: 'Canada', region: 'Quebec', lat: 46.1186, lon: -74.5819, tz_iana: 'America/Toronto', isSkiResort: true, baseElevationFt: 755, midElevationFt: 1813, topElevationFt: 2871 },
  { name: 'Vail', country: 'United States', region: 'Colorado', lat: 39.6061, lon: -106.355, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 8120, midElevationFt: 9800, topElevationFt: 11480 },
  { name: "Val d'Isère", country: 'France', region: 'Auvergne-Rhône-Alpes', lat: 45.4497, lon: 6.9797, tz_iana: 'Europe/Paris', isSkiResort: true, baseElevationFt: 6070, midElevationFt: 8777, topElevationFt: 11483 },
  { name: 'Valle Nevado', country: 'Chile', region: 'Región Metropolitana', lat: -33.3572, lon: -70.3033, tz_iana: 'America/Santiago', isSkiResort: true, baseElevationFt: 9925, midElevationFt: 10982, topElevationFt: 12038 },
  { name: 'Verbier', country: 'Switzerland', region: 'Valais', lat: 46.0964, lon: 7.2283, tz_iana: 'Europe/Zurich', isSkiResort: true, baseElevationFt: 4921, midElevationFt: 7923, topElevationFt: 10925 },
  { name: 'Whistler Blackcomb', country: 'Canada', region: 'British Columbia', lat: 50.1164, lon: -122.9548, tz_iana: 'America/Vancouver', isSkiResort: true, baseElevationFt: 2214, midElevationFt: 4854, topElevationFt: 7494 },
  { name: 'Whitefish', country: 'United States', region: 'Montana', lat: 48.4861, lon: -114.3533, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 4464, midElevationFt: 5641, topElevationFt: 6817 },
  { name: 'Wildcat', country: 'United States', region: 'New Hampshire', lat: 44.2589, lon: -71.2372, tz_iana: 'America/New_York', isSkiResort: true, baseElevationFt: 1950, midElevationFt: 3006, topElevationFt: 4062 },
  { name: 'Winter Park', country: 'United States', region: 'Colorado', lat: 39.8868, lon: -105.7625, tz_iana: 'America/Denver', isSkiResort: true, baseElevationFt: 9000, midElevationFt: 10527, topElevationFt: 12060 },
  { name: 'Zermatt', country: 'Switzerland', region: 'Valais', lat: 46.01511, lon: 7.74305, tz_iana: 'Europe/Zurich', isSkiResort: true, baseElevationFt: 5312, midElevationFt: 8924, topElevationFt: 12533 },
].map((loc) => ({
  ...loc,
  refreshHours: FAST_REFRESH_REGIONS.has(loc.region) ? 2 : 8,
  apiModelNames: MODEL_PRESETS_BY_COUNTRY[loc.country] || [],
}));

async function seed() {
  try {
    await mongoose.connect(`${config.db.url}${databaseName}?retryWrites=true&w=majority`);
    console.log('Connected');

    const ops = seedLocations.map((loc) => ({
      updateOne: {
        filter: { lat: loc.lat, lon: loc.lon },
        update: { $set: loc },
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

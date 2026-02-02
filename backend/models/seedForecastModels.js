'use strict';

const mongoose = require('mongoose');
require('dotenv').config();
const ForecastModel = require('./forecastModelDb');

const { config } = require('../config');
const databaseName = config.db.name;

const seedForecastModels = [
  {
    apiModelName: 'gfs_hrrr',
    displayName: 'GFS HRRR',
    description: 'Short range, US',
    maxForecastDays: 2,
    refreshHours: 1,
  },
  {
    apiModelName: 'ncep_nbm_conus',
    displayName: 'NCEP NBM CONUS',
    description: 'Mid range, blend of US models',
    maxForecastDays: 11,
    refreshHours: 1,
  },
  {
    apiModelName: 'gfs_seamless',
    displayName: 'GFS Seamless',
    description: 'Long range, global',
    maxForecastDays: 16,
    refreshHours: 6,
  },
  {
    apiModelName: 'gem_hrdps_continental',
    displayName: 'GEM HRDPS Continental',
    description: 'Short range, Canada',
    maxForecastDays: 2,
    refreshHours: 6,
  },
  {
    apiModelName: 'gem_regional',
    displayName: 'GEM Regional',
    description: 'Mid range, Canada',
    maxForecastDays: 4,
    refreshHours: 6,
  },
  {
    apiModelName: 'jma_msm',
    displayName: 'JMA MSM',
    description: 'Short range, Japan',
    maxForecastDays: 11,
    refreshHours: 3,
  },
  {
    apiModelName: 'jma_gsm',
    displayName: 'JMA GSM',
    description: 'Long range, Japan',
    maxForecastDays: 11,
    refreshHours: 6,
  },
  {
    apiModelName: 'ecmwf_ifs',
    displayName: 'ECMWF IFS',
    description: 'Long range, Europe',
    maxForecastDays: 15,
    refreshHours: 6,
  },
  {
    apiModelName: 'icon_d2',
    displayName: 'ICON D2',
    description: 'Short range, Central Europe',
    maxForecastDays: 2,
    refreshHours: 3,
  },
  {
    apiModelName: 'icon_eu',
    displayName: 'ICON EU',
    description: 'Short range, Europe',
    maxForecastDays: 5,
    refreshHours: 3,
  },
  {
    apiModelName: 'icon_global',
    displayName: 'ICON Global',
    description: 'Mid range, global',
    maxForecastDays: 8,
    refreshHours: 6,
  },
];

async function seed() {
  try {
    await mongoose.connect(`${config.db.url}${databaseName}?retryWrites=true&w=majority`);
    console.log('Connected');

    const ops = seedForecastModels.map((model) => ({
      updateOne: {
        filter: { apiModelName: model.apiModelName },
        update: { $setOnInsert: model },
        upsert: true,
      },
    }));

    const result = await ForecastModel.bulkWrite(ops, { ordered: false });
    console.log(`Upserted ${result.upsertedCount || 0} forecast models.`);
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
  seedForecastModels,
};

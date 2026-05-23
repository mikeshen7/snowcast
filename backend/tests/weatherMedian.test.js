'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const hourlyWeatherDb = require('../models/hourlyWeatherDb');
const {
  addElevationFilter,
  addOrFilter,
  medianHourlyDocs,
} = require('../modules/weatherShared');
const { persistMedianWeatherDocs } = require('../modules/weatherApi');

function hourlyDoc(overrides = {}) {
  return {
    key: `${overrides.locationId || 'loc1'}-${overrides.model || 'gfs'}-${overrides.elevationKey || 'mid'}-${overrides.dateTimeEpoch || 1000}`,
    resort: 'Test Bowl',
    locationId: 'loc1',
    model: 'gfs',
    elevationKey: 'mid',
    elevationFt: 9000,
    dateTimeEpoch: 1000,
    dayOfWeek: 1,
    date: 1,
    month: 2,
    year: 2026,
    dateTime: '2026-02-01T12:00',
    hour: 12,
    min: 0,
    precipProb: 20,
    precip: 1,
    snow: 0,
    rain: 1,
    windspeed: 10,
    cloudCover: 40,
    visibility: 8,
    freezingLevelFt: 7000,
    snowDepthIn: 30,
    conditions: 'Cloudy',
    icon: 'cloudy',
    temp: 20,
    feelsLike: 15,
    ...overrides,
  };
}

test('medianHourlyDocs materializes median rows per hour', () => {
  const docs = [
    hourlyDoc({ model: 'gfs', temp: 10, feelsLike: 8, precip: 1, snow: 0, rain: 1, precipProb: 20 }),
    hourlyDoc({ model: 'nbm', temp: 20, feelsLike: 18, precip: 3, snow: 2, rain: 1, precipProb: 60 }),
    hourlyDoc({ model: 'gfs', temp: 999, precip: 999, precipProb: 999 }),
    hourlyDoc({ model: 'gfs', dateTimeEpoch: 2000, temp: 30, precip: 0, snow: 0, rain: 0, precipProb: 10 }),
    hourlyDoc({ model: 'nbm', dateTimeEpoch: 2000, temp: 40, precip: 2, snow: 2, rain: 0, precipProb: 50 }),
  ];

  const medianDocs = medianHourlyDocs(docs, ['gfs', 'nbm']);

  assert.equal(medianDocs.length, 2);
  assert.equal(medianDocs[0].model, 'median');
  assert.equal(medianDocs[0].key, 'loc1-median-mid-1000');
  assert.equal(medianDocs[0].temp, 15);
  assert.equal(medianDocs[0].feelsLike, 13);
  assert.equal(medianDocs[0].precip, 2);
  assert.equal(medianDocs[0].snow, 1);
  assert.equal(medianDocs[0].precipProb, 40);
  assert.deepEqual(medianDocs[0].precipType, ['mixed']);

  assert.equal(medianDocs[1].dateTimeEpoch, 2000);
  assert.equal(medianDocs[1].temp, 35);
  assert.deepEqual(medianDocs[1].precipType, ['snow']);
});

test('query helper filters preserve legacy mid elevation rows', () => {
  const midFilter = { locationId: 'loc1' };
  addElevationFilter(midFilter, 'mid');
  assert.deepEqual(midFilter, {
    locationId: 'loc1',
    $or: [
      { elevationKey: 'mid' },
      { elevationKey: { $exists: false } },
      { elevationKey: null },
    ],
  });

  const topFilter = { locationId: 'loc1' };
  addElevationFilter(topFilter, 'top');
  assert.deepEqual(topFilter, {
    locationId: 'loc1',
    elevationKey: 'top',
  });

  addOrFilter(midFilter, [{ model: { $in: ['gfs', 'nbm'] } }]);
  assert.deepEqual(midFilter, {
    locationId: 'loc1',
    $and: [
      {
        $or: [
          { elevationKey: 'mid' },
          { elevationKey: { $exists: false } },
          { elevationKey: null },
        ],
      },
      {
        $or: [{ model: { $in: ['gfs', 'nbm'] } }],
      },
    ],
  });
});

test('persistMedianWeatherDocs writes median rows with stable keys', async () => {
  const originalFind = hourlyWeatherDb.find;
  const originalBulkWrite = hourlyWeatherDb.bulkWrite;
  const sourceDocs = [
    hourlyDoc({ model: 'gfs', temp: 12, precip: 1, snow: 1, rain: 0 }),
    hourlyDoc({ model: 'nbm', temp: 18, precip: 3, snow: 3, rain: 0 }),
  ];
  let findFilter;
  let bulkOps;

  hourlyWeatherDb.find = (filter) => {
    findFilter = filter;
    return {
      sort() {
        return {
          lean: async () => sourceDocs,
        };
      },
    };
  };
  hourlyWeatherDb.bulkWrite = async (ops) => {
    bulkOps = ops;
    return { upsertedCount: ops.length };
  };

  try {
    const result = await persistMedianWeatherDocs(
      {
        _id: 'loc1',
        name: 'Test Bowl',
        midElevationFt: 9000,
        apiModelNames: ['gfs', 'nbm'],
      },
      { elevationKey: 'mid', modelNames: ['gfs', 'nbm'] }
    );

    assert.equal(result.count, 1);
    assert.deepEqual(findFilter, {
      locationId: 'loc1',
      model: { $in: ['gfs', 'nbm'] },
      $or: [
        { elevationKey: 'mid' },
        { elevationKey: { $exists: false } },
        { elevationKey: null },
      ],
    });
    assert.equal(bulkOps.length, 1);
    assert.equal(bulkOps[0].updateOne.filter.key, 'loc1-median-mid-1000');
    assert.equal(bulkOps[0].updateOne.update.$set.model, 'median');
    assert.equal(bulkOps[0].updateOne.update.$set.temp, 15);
    assert.equal(bulkOps[0].updateOne.update.$set.elevationFt, 9000);
  } finally {
    hourlyWeatherDb.find = originalFind;
    hourlyWeatherDb.bulkWrite = originalBulkWrite;
  }
});

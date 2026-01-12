'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'hourlyWeatherDb';

// Create Schema
const hourlyWeatherSchema = new Schema(
  {
    key: { type: String, required: true,  unique: true},
    resort: { type: String, required: true }, // legacy name field
    locationId: { type: String }, // optional link to locations collection
    model: { type: String, default: 'auto' },
    elevationKey: { type: String, default: 'mid' },
    elevationFt: { type: Number },
    dateTimeEpoch: { type: Number, required: true }, // in seconds since 1970
    dayOfWeek: { type: Number }, // 1-7
    date: { type: Number }, // 1-31
    month: { type: Number }, // 1-12
    year: { type: Number }, // i.e. 2023
    dateTime: { type: String },
    hour: { type: Number }, // 0-23
    min: { type: Number }, // 0-59
    precipProb: { type: Number }, // 0-100%
    precipType: { type: Array }, // Array, with possible values rain, snow, freezingrain, ice
    precip: { type: Number }, // inches, including snow or ice
    snow: { type: Number }, // inches
    rain: { type: Number }, // inches (precip minus snow)
    windspeed: { type: Number }, // average windspeed, mph
    cloudCover: { type: Number }, // 0-100%
    visibility: { type: Number }, // distance at which distant objects are visible, miles
    freezingLevelFt: { type: Number }, // feet
    snowDepthIn: { type: Number }, // inches
    conditions: { type: String }, // text description
    icon: { type: String }, // https://www.visualcrossing.com/resources/documentation/weather-api/defining-icon-set-in-the-weather-api/
    temp: { type: Number }, // °F
    feelsLike: { type: Number }, // °F
  },
  { collection: collectionName }
);

// Create Collection
hourlyWeatherSchema.index({ locationId: 1, dateTimeEpoch: 1, model: 1, elevationKey: 1 });
const weatherDbCollection = mongoose.model(collectionName, hourlyWeatherSchema);

module.exports = weatherDbCollection;

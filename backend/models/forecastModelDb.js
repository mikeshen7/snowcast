'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const forecastModelSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    label: { type: String, default: '' },
    apiModelParam: { type: String, default: '' },
    maxForecastDays: { type: Number, default: 16 },
    refreshHours: { type: Number, default: 2 },
    enabled: { type: Boolean, default: true },
    lastFetchedAt: { type: Date, default: null },
  },
  {
    collection: 'forecastModels',
    timestamps: true,
  }
);

forecastModelSchema.index({ code: 1 });

const forecastModelDb = mongoose.model('forecastModels', forecastModelSchema, 'forecastModels');

module.exports = forecastModelDb;

'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const forecastModelSchema = new Schema(
  {
    apiModelName: { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    maxForecastDays: { type: Number, required: true },
    refreshHours: { type: Number, required: true },
  },
  {
    collection: 'forecastModels',
    timestamps: true,
  }
);

forecastModelSchema.index({ apiModelName: 1 });

const forecastModelDb = mongoose.model('forecastModels', forecastModelSchema, 'forecastModels');

module.exports = forecastModelDb;

'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'locations';

const locationsSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    region: { type: String, default: '', trim: true }, // state/province/region; empty string to keep uniqueness predictable
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    tz_iana: { type: String, required: true, trim: true }, // e.g., America/Denver
    isSkiResort: { type: Boolean, default: false },
  },
  {
    collection: collectionName,
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Prevent exact duplicate coordinates (centroid)
locationsSchema.index({ lat: 1, lon: 1 }, { unique: true });

const locationsDb = mongoose.model(collectionName, locationsSchema);

module.exports = locationsDb;

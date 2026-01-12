'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'powAlerts';

const powAlertSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'adminUsers', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'locations', required: true },
    windowDays: { type: Number, default: 3, min: 1, max: 14 },
    thresholdIn: { type: Number, default: 3, min: 0 },
    model: { type: String, default: 'median' },
    elevationKey: { type: String, default: 'mid' },
    active: { type: Boolean, default: true },
    lastNotifiedAt: { type: Date },
    lastNotifiedForDate: { type: String, default: '' }, // local YYYY-MM-DD of earliest trigger day
  },
  {
    collection: collectionName,
    timestamps: true,
  }
);

const powAlertDb = mongoose.model(collectionName, powAlertSchema);

module.exports = powAlertDb;

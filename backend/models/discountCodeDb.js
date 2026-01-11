'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'discountCodes';
const discountCodeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    durationMonths: { type: Number, required: true, min: 1 },
    maxUses: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    redeemedBy: [{ type: Schema.Types.ObjectId, ref: 'adminUsers', default: [] }],
  },
  {
    collection: collectionName,
    timestamps: true,
  }
);

const discountCodeDb = mongoose.model(collectionName, discountCodeSchema);

module.exports = discountCodeDb;

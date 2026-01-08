'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'discountCodes';
const allowedRoles = ['level1', 'level2', 'level3', 'admin', 'owner'];

const discountCodeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    targetRole: { type: String, enum: allowedRoles, required: true },
    active: { type: Boolean, default: true },
  },
  {
    collection: collectionName,
    timestamps: true,
  }
);

const discountCodeDb = mongoose.model(collectionName, discountCodeSchema);

module.exports = discountCodeDb;

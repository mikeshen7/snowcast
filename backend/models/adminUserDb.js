'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'adminUsers';
const allowedRoles = ['owner', 'admin', 'basic', 'standard', 'advanced'];
const allowedLocationAccess = ['all', 'resort-only'];

const adminUserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, trim: true, default: '' },
    roles: {
      type: [String],
      enum: allowedRoles,
      default: ['basic'],
      set: (values) => {
        const arr = Array.isArray(values) ? values : [values];
        const filtered = arr
          .map((v) => String(v || '').trim())
          .filter((v) => allowedRoles.includes(v));
        return filtered.slice(0, 1);
      },
    },
    locationAccess: {
      type: String,
      enum: allowedLocationAccess,
      default: 'all',
    },
    adminAccess: { type: Boolean, default: false },
    favoriteLocations: [{ type: Schema.Types.ObjectId, ref: 'locations', default: [] }],
    homeResortId: { type: Schema.Types.ObjectId, ref: 'locations', default: null },
    unitsPreference: { type: String, enum: ['imperial', 'metric'], default: 'imperial' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String, default: '' },
    lastLoginUserAgent: { type: String, default: '' },
  },
  {
    collection: collectionName,
    timestamps: true,
  }
);

const adminUserDb = mongoose.model(collectionName, adminUserSchema);

module.exports = adminUserDb;

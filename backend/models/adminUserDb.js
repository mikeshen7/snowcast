'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'users';
const allowedRoles = ['admin', 'free', 'premium'];
const adminUserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, trim: true, required: true },
    roles: {
      type: [String],
      enum: allowedRoles,
      default: ['free'],
      validate: {
        validator: (values) => !Array.isArray(values) || values.length <= 1,
        message: 'Only one role is allowed per user.',
      },
      set: (values) => {
        const arr = Array.isArray(values) ? values : [values];
        const filtered = arr
          .map((v) => String(v || '').trim())
          .filter((v) => allowedRoles.includes(v));
        return filtered.slice(0, 1);
      },
    },
    favoriteLocations: [{ type: Schema.Types.ObjectId, ref: 'locations', default: [] }],
    homeResortId: { type: Schema.Types.ObjectId, ref: 'locations', default: null },
    unitsPreference: { type: String, enum: ['imperial', 'metric'], default: 'imperial' },
    forecastModel: { type: String, enum: ['median', 'blend', 'gfs', 'ecmwf', 'hrrr'], default: 'median' },
    forecastElevation: { type: String, enum: ['base', 'mid', 'top'], default: 'mid' },
    subscriptionExpiresAt: { type: Date, default: null },
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

const adminUserDb = mongoose.model('adminUsers', adminUserSchema, collectionName);

module.exports = adminUserDb;

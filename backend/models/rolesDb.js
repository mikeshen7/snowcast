'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const rolesSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    label: { type: String, default: '' },
    favoritesLimit: { type: Number, default: 0 },
    hourlyAccess: { type: Boolean, default: false },
    powAlertsLimit: { type: Number, default: 0 },
    checkPowAccess: { type: Boolean, default: false },
    forecastBack: { type: Number, default: 0 },
    forecastForward: { type: Number, default: 0 },
  },
  {
    collection: 'roles',
    timestamps: true,
  }
);

const rolesDb = mongoose.model('roles', rolesSchema);

module.exports = rolesDb;

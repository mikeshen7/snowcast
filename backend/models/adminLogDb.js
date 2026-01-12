'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const adminLogSchema = new Schema(
  {
    type: { type: String, required: true },
    message: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    collection: 'adminLogs',
    timestamps: true,
  }
);

adminLogSchema.index({ createdAt: -1 });

const adminLogDb = mongoose.model('adminLogs', adminLogSchema, 'adminLogs');

module.exports = adminLogDb;

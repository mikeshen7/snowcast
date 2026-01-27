'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const adminLogSchema = new Schema(
  {
    jobId: { type: String, index: true },
    type: { type: String, required: true },
    status: { type: String, default: '' },
    location: { type: String, default: '' },
    message: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    collection: 'adminLogs',
    timestamps: true,
  }
);

adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ jobId: 1 });

const adminLogDb = mongoose.model('adminLogs', adminLogSchema, 'adminLogs');

module.exports = adminLogDb;

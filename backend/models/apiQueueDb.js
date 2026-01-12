// api Queue Db module.
'use strict';

const mongoose = require('mongoose');

const apiQueueSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'active', 'done', 'error'],
      default: 'pending',
      index: true,
    },
    kind: {
      type: String,
      enum: ['http'],
      default: 'http',
    },
    url: { type: String, required: true },
    timeoutMs: { type: Number, default: 10000 },
    attempts: { type: Number, default: 0 },
    nextRunAt: { type: Date, default: Date.now, index: true },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    lastError: { type: String },
    meta: { type: Object, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

apiQueueSchema.index({ status: 1, nextRunAt: 1, createdAt: 1 });

module.exports = mongoose.model('apiQueue', apiQueueSchema);

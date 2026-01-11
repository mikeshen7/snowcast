'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const engagementEventSchema = new Schema(
  {
    event: { type: String, required: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'adminUsers', default: null },
    role: { type: String, trim: true, default: 'guest' },
    sessionId: { type: String, trim: true, default: '' },
    locationId: { type: Schema.Types.ObjectId, ref: 'locations', default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    collection: 'engagementEvents',
    timestamps: true,
  }
);

engagementEventSchema.index({ createdAt: -1 });
engagementEventSchema.index({ event: 1, createdAt: -1 });
engagementEventSchema.index({ user: 1, createdAt: -1 });

const engagementEventDb = mongoose.model('engagementEvents', engagementEventSchema, 'engagementEvents');

module.exports = engagementEventDb;

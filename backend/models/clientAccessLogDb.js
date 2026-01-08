'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'clientAccessLogs';

const clientAccessLogSchema = new Schema(
  {
    client: { type: Schema.Types.ObjectId, ref: 'apiClients', required: true },
    ip: { type: String, default: '' },
    host: { type: String, default: '' },
    origin: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  {
    collection: collectionName,
    timestamps: true,
  }
);

clientAccessLogSchema.index({ client: 1, createdAt: -1 });
clientAccessLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }); // keep 7 days

const clientAccessLogDb = mongoose.model(collectionName, clientAccessLogSchema);

module.exports = clientAccessLogDb;

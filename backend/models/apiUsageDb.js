'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'apiUsage';

const apiUsageSchema = new Schema(
  {
    client: { type: Schema.Types.ObjectId, ref: 'apiClients', required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, default: 0 },
    dailyCount: { type: Number, default: 0 },
  },
  {
    collection: collectionName,
    timestamps: true,
  }
);

apiUsageSchema.index({ client: 1, windowStart: 1 }, { unique: true });
apiUsageSchema.index({ windowStart: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

const apiUsageDb = mongoose.model(collectionName, apiUsageSchema);

module.exports = apiUsageDb;

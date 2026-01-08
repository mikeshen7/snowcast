'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'apiDailyUsage';

const apiDailyUsageSchema = new Schema(
  {
    client: { type: Schema.Types.ObjectId, ref: 'apiClients', required: true },
    dayKey: { type: String, required: true }, // YYYY-MM-DD UTC
    count: { type: Number, default: 0 },
  },
  {
    collection: collectionName,
    timestamps: true,
  }
);

apiDailyUsageSchema.index({ client: 1, dayKey: 1 }, { unique: true });
apiDailyUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 }); // keep 2 weeks

const apiDailyUsageDb = mongoose.model(collectionName, apiDailyUsageSchema);

module.exports = apiDailyUsageDb;

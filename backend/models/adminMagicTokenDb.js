'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'adminMagicTokens';

const adminMagicTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'adminUsers', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    createdFromIp: { type: String, default: '' },
    createdFromUserAgent: { type: String, default: '' },
    consumedFromIp: { type: String, default: '' },
    consumedFromUserAgent: { type: String, default: '' },
  },
  {
    collection: collectionName,
    timestamps: true,
  }
);

adminMagicTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const adminMagicTokenDb = mongoose.model(collectionName, adminMagicTokenSchema);

module.exports = adminMagicTokenDb;

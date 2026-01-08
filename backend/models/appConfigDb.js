'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const collectionName = 'appConfig';

const configSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String, default: '' },
  },
  { collection: collectionName, timestamps: true }
);

const appConfigDb = mongoose.model(collectionName, configSchema);

module.exports = appConfigDb;

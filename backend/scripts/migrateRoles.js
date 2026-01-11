'use strict';

const mongoose = require('mongoose');
const adminUserDb = require('../models/adminUserDb');
const { config } = require('../config');

const ROLE_MAP = {
  basic: 'free',
  standard: 'premium',
  advanced: 'premium',
  level1: 'free',
  level2: 'premium',
  level3: 'premium',
  owner: 'admin',
};

async function migrateRoles() {
  try {
    const databaseName = config.db.name;
    await mongoose.connect(`${config.db.url}${databaseName}?retryWrites=true&w=majority`);
    console.log('Connected to database');

    const legacyRoles = Object.keys(ROLE_MAP);
    const users = await adminUserDb.find({ roles: { $in: legacyRoles } }).lean();
    if (!users.length) {
      console.log('No legacy roles found.');
      return;
    }

    const ops = users.map((user) => {
      const nextRoles = (user.roles || []).map((role) => ROLE_MAP[role] || role);
      return {
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { roles: nextRoles } },
        },
      };
    });

    const result = await adminUserDb.bulkWrite(ops, { ordered: false });
    console.log(`Updated ${result.modifiedCount || 0} users.`);
  } catch (error) {
    console.error('Role migration failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

migrateRoles();

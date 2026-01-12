// user Role module.
'use strict';

const ADMIN_ROLE = 'admin';
const FREE_ROLE = 'free';
const PREMIUM_ROLE = 'premium';

// resolve User Role returns derived role from admin flag + expiration.
function resolveUserRole(user) {
  if (!user) return FREE_ROLE;
  if (user.isAdmin) return ADMIN_ROLE;
  if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()) {
    return PREMIUM_ROLE;
  }
  return FREE_ROLE;
}

// is Admin helper.
function isAdminUser(user) {
  return Boolean(user?.isAdmin);
}

module.exports = {
  ADMIN_ROLE,
  FREE_ROLE,
  PREMIUM_ROLE,
  resolveUserRole,
  isAdminUser,
};

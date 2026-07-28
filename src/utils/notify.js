const Notification = require('../models/Notification');

// Small helper called from wherever an event happens — keeps notification
// creation a single line at each call site, and fails silently rather than
// breaking the action that triggered it (a failed notification shouldn't
// stop a vote or a deal approval from succeeding).
const notify = async ({ userId, type, message, link = null }) => {
  try {
    await Notification.create({ userId, type, message, link });
  } catch (error) {
    console.error('Failed to create notification:', error.message);
  }
};

module.exports = { notify };
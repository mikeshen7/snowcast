// feedback handler.
'use strict';

const { config } = require('../config');
const { sendEmail } = require('./email');
const { getFrontendUserFromRequest } = require('./frontendAuth');

// Handle feedback submission.
async function handleSubmitFeedback(request, response) {
  const message = String(request.body?.message || '').trim();
  if (!message) {
    return response.status(400).send({ error: 'Message is required' });
  }
  const recipient = config.backend.adminEmail;
  if (!recipient) {
    return response.status(400).send({ error: 'BACKEND_ADMIN_EMAIL is not configured' });
  }
  const user = await getFrontendUserFromRequest(request);
  const context = request.body?.context && typeof request.body.context === 'object' ? request.body.context : null;
  const meta = {
    user: user?.email || 'anonymous',
    ip: request.ip,
    userAgent: request.headers['user-agent'] || '',
    context,
  };
  const text = [
    'Snowcast feedback',
    '',
    message,
    '',
    '---',
    `User: ${meta.user}`,
    `IP: ${meta.ip}`,
    `User-Agent: ${meta.userAgent}`,
    `Context: ${context ? JSON.stringify(context, null, 2) : 'none'}`,
  ].join('\n');
  await sendEmail({
    to: recipient,
    subject: 'Snowcast feedback',
    text,
  });
  return response.status(200).send({ ok: true });
}

module.exports = { handleSubmitFeedback };

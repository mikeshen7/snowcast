// email module.
'use strict';

const axios = require('axios');
const { config } = require('../config');

// send Email helper.
async function sendEmail({ to, subject, text, html, from }) {
  const sender = from || config.email.from;
  if (!sender) {
    throw new Error('Sender email is required');
  }
  const apiKey = config.email.brevoApiKey;
  const endpointUrl = config.email.brevoEndpointUrl;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is required');
  }
  if (!endpointUrl) {
    throw new Error('BREVO_API_ENDPOINT_URL is required');
  }
  return sendViaBrevo({ to, subject, text, html, from: sender, apiKey, endpointUrl });
}

// send Via Brevo helper.
async function sendViaBrevo({ to, from, subject, text, html, apiKey, endpointUrl }) {
  const payload = {
    sender: { email: from },
    to: Array.isArray(to) ? to.map((email) => ({ email })) : [{ email: to }],
    subject,
    textContent: text,
  };
  if (html) {
    payload.htmlContent = html;
  }
  await axios.post(endpointUrl, payload, {
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
}

module.exports = { sendEmail };

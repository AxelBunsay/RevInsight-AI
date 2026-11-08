const nodemailer = require('nodemailer');

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_SEND_TIMEOUT_MS = 10_000;
const DELIVERY_ERROR_MESSAGE = 'Email delivery failed.';
let smtpTransport;

class EmailDeliveryError extends Error {
  constructor(statusCode) {
    super(DELIVERY_ERROR_MESSAGE);
    this.name = 'EmailDeliveryError';
    this.code = 'EMAIL_DELIVERY_FAILED';
    this.statusCode = statusCode;
  }
}

function sanitizeLogMessage(message) {
  let safeMessage = String(message || 'Unknown email delivery error');
  const apiKey = process.env.BREVO_API_KEY;
  if (apiKey) safeMessage = safeMessage.split(apiKey).join('[redacted]');
  return safeMessage.replace(/\b\d{6}\b/g, '[redacted]').slice(0, 500);
}

function getSmtpTransport() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }
  return smtpTransport;
}

async function getBrevoErrorMessage(response) {
  const responseBody = await response.text().catch(() => '');
  if (!responseBody) return response.statusText || 'Brevo rejected the email request.';
  try {
    const body = JSON.parse(responseBody);
    return body.message || body.error || responseBody;
  } catch {
    return responseBody;
  }
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.BREVO_API_KEY) {
    try {
      return await getSmtpTransport().sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
        text
      });
    } catch (error) {
      console.error('[sendEmail] SMTP delivery failed', {
        error: sanitizeLogMessage(error.message)
      });
      throw new EmailDeliveryError(502);
    }
  }

  if (!process.env.EMAIL_FROM) {
    console.error('[sendEmail] Brevo delivery is not configured', {
      status: 'configuration',
      error: 'EMAIL_FROM is not set.'
    });
    throw new EmailDeliveryError(503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_SEND_TIMEOUT_MS);
  try {
    const sender = {
      email: process.env.EMAIL_FROM,
      ...(process.env.EMAIL_FROM_NAME ? { name: process.env.EMAIL_FROM_NAME } : {})
    };
    const response = await fetch(BREVO_EMAIL_URL, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorMessage = sanitizeLogMessage(await getBrevoErrorMessage(response));
      console.error('[sendEmail] Brevo delivery failed', {
        status: response.status,
        error: errorMessage
      });
      throw new EmailDeliveryError(response.status >= 500 ? 503 : 502);
    }
    return response;
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    const timedOut = controller.signal.aborted;
    const errorMessage = timedOut
      ? `Request timed out after ${EMAIL_SEND_TIMEOUT_MS / 1000} seconds.`
      : sanitizeLogMessage(error.message);
    console.error('[sendEmail] Brevo request failed', {
      status: timedOut ? 'timeout' : 'unavailable',
      error: errorMessage
    });
    throw new EmailDeliveryError(503);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DELIVERY_ERROR_MESSAGE,
  EMAIL_SEND_TIMEOUT_MS,
  EmailDeliveryError,
  sendEmail,
  get transporter() {
    return getSmtpTransport();
  }
};
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const emailSender = require('../utils/sendEmail');
const { EMAIL_SEND_TIMEOUT_MS, sendEmail } = emailSender;
const message = {
  to: 'rider@example.com',
  subject: 'Verification code',
  text: 'Your code is 123456.',
  html: '<p>Your code is <strong>123456</strong>.</p>'
};

describe('sendEmail', () => {
  beforeEach(() => {
    vi.stubEnv('BREVO_API_KEY', 'test-api-key');
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com');
    vi.stubEnv('EMAIL_FROM_NAME', 'RevInsight Test');
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('sends through Brevo over HTTPS using configured sender and message content', async () => {
    fetch.mockResolvedValue({ ok: true, status: 201 });

    await sendEmail(message);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'api-key': 'test-api-key', 'content-type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual({
      sender: { email: 'noreply@example.com', name: 'RevInsight Test' },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('logs a Brevo response error without exposing the API key or OTP', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: 'Invalid sender.' })
    });

    await expect(sendEmail(message)).rejects.toMatchObject({
      code: 'EMAIL_DELIVERY_FAILED',
      statusCode: 502
    });
    expect(console.error).toHaveBeenCalledWith('[sendEmail] Brevo delivery failed', {
      status: 400,
      error: 'Invalid sender.'
    });
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('test-api-key');
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('123456');
  });

  it('aborts a Brevo request after ten seconds and reports an unavailable service', async () => {
    vi.useFakeTimers();
    fetch.mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));

    const pending = expect(sendEmail(message)).rejects.toMatchObject({
      code: 'EMAIL_DELIVERY_FAILED',
      statusCode: 503
    });
    await vi.advanceTimersByTimeAsync(EMAIL_SEND_TIMEOUT_MS);
    await pending;
    expect(console.error).toHaveBeenCalledWith('[sendEmail] Brevo request failed', {
      status: 'timeout',
      error: 'Request timed out after 10 seconds.'
    });
  });

  it('falls back to the configured Nodemailer transport when Brevo is not configured', async () => {
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('EMAIL_SERVICE', 'test-mail');
    vi.stubEnv('EMAIL_USER', 'smtp@example.com');
    vi.stubEnv('EMAIL_PASSWORD', 'test-password');
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com');
    const sendMail = vi.spyOn(emailSender.transporter, 'sendMail').mockResolvedValue({ accepted: [message.to] });

    await sendEmail(message);

    expect(sendMail).toHaveBeenCalledWith({
      ...message,
      from: 'smtp@example.com'
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
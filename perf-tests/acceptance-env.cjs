// Loaded only by the isolated acceptance server, before server.js loads .env.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const configured = require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env')));
for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_FALLBACK_MODEL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
  process.env[key] = configured[key] || '';
}
// Never use configured shop mail, database, or admin credentials.
for (const key of ['EMAIL_SERVICE', 'EMAIL_USER', 'EMAIL_PASSWORD', 'BREVO_API_KEY']) process.env[key] = '';
process.env.EMAIL_FROM = 'qa@revinsight.invalid';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'isolated-acceptance-secret-2026-at-least-32-characters';
process.env.ADMIN_USERNAME = 'qa_admin';
process.env.ADMIN_PASSWORD = 'AcceptancePass1';
process.env.FRONTEND_URL = 'http://localhost:5100';
process.env.PORT = '5100';
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '.acceptance-state.json')));
if (!/^mongodb:\/\/127\.0\.0\.1:/.test(state.mongoUri) || !state.mongoUri.includes('acceptance_')) throw new Error('Refusing a non-isolated database');
process.env.MONGODB_URI = state.mongoUri;
if (state.aiUnavailable) process.env.GEMINI_API_KEY = 'invalid-acceptance-key';
const cloudinary = require('../backend/config/cloudinary');
const originalUpload = cloudinary.uploader.upload_stream;
cloudinary.uploader.upload_stream = function (options, callback) {
  return originalUpload.call(this, {
    ...options,
    folder: `revinsight-acceptance/${state.runId || 'investigation'}/${options.folder || 'images'}`
  }, callback);
};
const mailPath = require.resolve('../backend/utils/sendEmail');
const mailConfigPath = path.join(__dirname, '.acceptance-mail.env');
let deliverTestEmail;
let allowedTestMailbox = '';
if (fs.existsSync(mailConfigPath)) {
  const mail = require('../backend/node_modules/dotenv').parse(fs.readFileSync(mailConfigPath));
  allowedTestMailbox = String(mail.ACCEPTANCE_TEST_MAILBOX || '').trim().toLowerCase();
  if (!allowedTestMailbox.includes('@')) throw new Error('ACCEPTANCE_TEST_MAILBOX is required for real test OTP delivery');
  for (const key of ['EMAIL_SERVICE', 'EMAIL_USER', 'EMAIL_PASSWORD', 'BREVO_API_KEY', 'EMAIL_FROM']) process.env[key] = mail[key] || '';
  deliverTestEmail = require(mailPath).sendEmail;
}
require.cache[mailPath] = { id: mailPath, filename: mailPath, loaded: true, exports: { sendEmail: async (...args) => {
  const deliveredToAllowlistedMailbox = deliverTestEmail && String(args[0]?.to || '').toLowerCase() === allowedTestMailbox;
  if (deliveredToAllowlistedMailbox) {
    // Human OTP handoff: never persist the email body or the code in the outbox.
    fs.appendFileSync(path.join(__dirname, '.acceptance-outbox.jsonl'), JSON.stringify({ at: new Date().toISOString(), recipient: '[allowlisted test inbox]', subject: args[0]?.subject, bodyRecorded: false, delivery: 'attempted' }) + '\n');
    try {
      const result = await deliverTestEmail(...args);
      fs.appendFileSync(path.join(__dirname, '.acceptance-outbox.jsonl'), JSON.stringify({ at: new Date().toISOString(), recipient: '[allowlisted test inbox]', bodyRecorded: false, delivery: 'provider accepted' }) + '\n');
      return result;
    } catch (error) {
      fs.appendFileSync(path.join(__dirname, '.acceptance-outbox.jsonl'), JSON.stringify({ at: new Date().toISOString(), recipient: '[allowlisted test inbox]', bodyRecorded: false, delivery: 'failed', code: error.code, statusCode: error.statusCode }) + '\n');
      throw error;
    }
  }
  fs.appendFileSync(path.join(__dirname, '.acceptance-outbox.jsonl'), JSON.stringify({ at: new Date().toISOString(), args }) + '\n');
} } };
// Authorized instrumentation records only the aggregate payload sent to AI.
const ai = require('../backend/services/aiService');
for (const name of ['generateRevenueInsights', 'generateCardInsights']) {
  const original = ai[name];
  ai[name] = async (...args) => {
    const start = performance.now();
    const file = path.join(root, 'docs/acceptance/evidence/ai-requests.jsonl');
    fs.appendFileSync(file, JSON.stringify({ event: 'start', name, at: new Date().toISOString(), ...(name === 'generateRevenueInsights' ? { question: args[0] } : {}), payload: name === 'generateCardInsights' ? args[0] : args[1] }) + '\n');
    try {
      const result = await original(...args);
      fs.appendFileSync(file, JSON.stringify({ event: 'end', name, elapsedMs: performance.now()-start, source: result?.source || 'ai' }) + '\n');
      return result;
    } catch (e) {
      fs.appendFileSync(file, JSON.stringify({ event: 'error', name, elapsedMs: performance.now()-start, status: e.status, message: String(e.message).split(process.env.GEMINI_API_KEY).join('[redacted]') }) + '\n');
      throw e;
    }
  };
}

// Diagnostic only: provider error details do not replace browser acceptance trials.
require('./acceptance-env.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { GoogleGenerativeAI } = require('../backend/node_modules/@google/generative-ai');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/acceptance/build-manifest.json')));
const out = path.resolve(root, 'docs/acceptance/evidence', process.argv[2] || 'retest-20261113/gemini-quota');
if (!out.startsWith(path.join(root, 'docs/acceptance/evidence') + path.sep)) throw new Error('Invalid evidence directory');
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'provider-status.json');
if (fs.existsSync(file)) throw new Error('Preserve previous diagnostic; choose a new output directory');
const models = [process.env.GEMINI_MODEL || 'gemini-3.6-flash', process.env.GEMINI_FALLBACK_MODEL].filter((model, i, all) => model && all.indexOf(model) === i);
const result = { buildId: manifest.buildId, startedAt: new Date().toISOString(),
  purpose: 'Current configured-provider quota diagnostic, not an acceptance pass', configuredModels: models, trials: [] };
const save = () => fs.writeFileSync(file, JSON.stringify(result, null, 2));
async function main() {
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, '.acceptance-state.json')));
  if (state.aiUnavailable || !process.env.GEMINI_API_KEY) throw new Error('Configured real AI credentials are unavailable in the QA environment');
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  for (const name of models) {
    const startedAt = new Date();
    const start = performance.now();
    const trial = { model: name, at: startedAt.toISOString(), prompt: 'Reply with the single word OK.' };
    try {
      const response = await client.getGenerativeModel({ model: name }).generateContent(trial.prompt, { timeout: 20000 });
      trial.response = response.response.text();
      trial.status = 'AVAILABLE';
    } catch (error) {
      trial.status = 'UNAVAILABLE';
      trial.providerHttpStatus = error.status || null;
      trial.providerStatusText = error.statusText || null;
      trial.message = String(error.message).split(process.env.GEMINI_API_KEY).join('[redacted]');
      trial.providerErrorDetails = error.errorDetails || [];
      const retry = trial.providerErrorDetails.find(detail => String(detail['@type']).endsWith('RetryInfo'))?.retryDelay;
      if (retry && /^\d+(\.\d+)?s$/.test(retry)) {
        trial.providerRetryDelaySeconds = parseFloat(retry);
        trial.providerSuggestedRetryAtUTC = new Date(startedAt.getTime() + parseFloat(retry) * 1000).toISOString();
      }
    }
    trial.elapsedMs = performance.now() - start;
    result.trials.push(trial); save();
    console.log(name, trial.status, trial.providerHttpStatus || 200, trial.providerSuggestedRetryAtUTC || '');
    if (trial.status === 'AVAILABLE') break; // Preserve quota for the required browser trials.
  }
  result.anyConfiguredModelAvailable = result.trials.some(trial => trial.status === 'AVAILABLE');
  result.completedAt = new Date().toISOString(); save();
}
main().catch(error => { result.error = String(error.message).split(process.env.GEMINI_API_KEY || '[no-key]').join('[redacted]'); save(); console.error(result.error); process.exitCode = 1; });

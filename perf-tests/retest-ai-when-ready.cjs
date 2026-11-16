// Run once after provider quota is available; leave content review to the evaluator.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/acceptance/build-manifest.json')));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const relative = 'retest-20261113/ai-ready-' + stamp;
const out = path.join(root, 'docs/acceptance/evidence', relative);
fs.mkdirSync(out, { recursive: true });
async function run(file, subfolder) {
  const log = fs.openSync(path.join(out, subfolder + '.txt'), 'w');
  const child = spawn(process.execPath, [path.join(__dirname, file), relative + '/' + subfolder], {
    cwd: root, windowsHide: true, stdio: ['ignore', log, log]
  });
  const code = await new Promise(resolve => child.on('exit', resolve));
  fs.closeSync(log);
  if (code !== 0) throw new Error(file + ' stopped; inspect ' + subfolder + '.txt');
}
async function main() {
  for (const group of ['files', 'bundle']) for (const [file, expected] of Object.entries(manifest[group])) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    if (actual !== expected) throw new Error('Build drift: ' + file + '. Freeze and retest a new application build first.');
  }
  if ((await fetch('http://localhost:5100/api/products?limit=1')).status !== 200) throw new Error('Start the isolated QA server first');
  await run('acceptance-gemini-quota.cjs', 'quota');
  const provider = JSON.parse(fs.readFileSync(path.join(out, 'quota/provider-status.json')));
  if (!provider.anyConfiguredModelAvailable) {
    fs.writeFileSync(path.join(out, 'blocked.json'), JSON.stringify({ buildId: manifest.buildId,
      status: 'SERVICE_BLOCKED', providerEvidence: 'quota/provider-status.json',
      cases: ['FT-036','FT-038','PT-016','PT-017','PT-018','PT-019'],
      note: 'Current daily quota remains unavailable. No acceptance trials or passes were manufactured.' }, null, 2));
    console.log('Gemini quota is still unavailable. Provider evidence saved:', out);
    return;
  }
  // This performs all three card trials, six question trials and genuine saved retrieval.
  await run('acceptance-ai.cjs', 'browser');
  fs.writeFileSync(path.join(out, 'review-required.json'), JSON.stringify({ buildId: manifest.buildId,
    browserEvidence: 'browser/ai-browser.json', reviewRequired: true,
    checks: ['Compare genuine answers against their actual aggregate prompts and dashboard figures',
      'Verify description, conditional likely outcomes and suggested actions',
      'Apply all trial rules, 25-word card limits, cooldown, and saved timestamp/no-provider-call checks',
      'Update supporting report only after review; leave expert answers/signatures untouched'] }, null, 2));
  console.log('Configured-AI browser rerun complete. Review every recorded status before updating the report:', out);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

"""Open the actual final PDFs/CSVs and verify frozen source and bundle hashes."""
import csv
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / 'docs/acceptance'
FINAL = DOC / 'evidence/final'
sys.path.insert(0, str(ROOT / 'perf-tests/.acceptance-python'))
from pypdf import PdfReader

manifest = json.loads((DOC / 'build-manifest.json').read_text(encoding='utf-8'))
checks = []
for group in ['files', 'bundle']:
    mismatches = [name for name, digest in manifest[group].items()
                  if not (ROOT / name).is_file()
                  or hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest]
    checks.append({'check': group + ' frozen hashes', 'status': 'FAIL' if mismatches else 'PASS',
                   'checkedFiles': len(manifest[group]), 'mismatches': mismatches})

ui = json.loads((FINAL / 'functional-ui/functional-ui.json').read_text(encoding='utf-8'))
reports = next(row for row in ui if row['id'] == 'FT-040')['actual']
for name, period in [('quarter-report.pdf', 'quarter'), ('month-report.pdf', 'month')]:
    file = FINAL / 'functional-ui' / name
    reader = PdfReader(file)
    content = '\n'.join(page.extract_text() for page in reader.pages)
    expected = reports[period]
    missing_ids = [r['id'] for r in expected['expectedRows'] if r['id'] not in content.replace('\n', '')]
    correct_period = expected['summary'].splitlines()[0] in content
    valid = bool(reader.pages) and correct_period and not missing_ids and 'Loading business records' not in content and 'Mechanic' in content
    checks.append({'id': 'FT-040', 'check': name, 'status': 'PASS' if valid else 'FAIL',
                   'pages': len(reader.pages), 'expectedTotal': expected['expectedTotal'],
                   'expectedRows': len(expected['expectedRows']), 'missingIds': missing_ids,
                   'correctPeriod': correct_period, 'extractedText': content})

for file in FINAL.rglob('*.csv'):
    with file.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.reader(handle))
    data = rows[2:]
    invalid = [row for row in data if len(row) != 9 or row[2] != 'Test1 Customer' or row[8] != 'Reserved']
    total = sum(float(row[4]) for row in data)
    paid = sum(float(row[5]) for row in data)
    balance = sum(float(row[6]) for row in data)
    valid = bool(data) and rows[1][0] == 'Record/Reservation ID' and not invalid and abs(total-paid-balance) < .01
    checks.append({'id': 'FT-040', 'check': file.relative_to(FINAL).as_posix(),
                   'status': 'PASS' if valid else 'FAIL', 'rows': len(data),
                   'total': total, 'paid': paid, 'balance': balance, 'invalidRows': invalid})

result = {'buildId': manifest['buildId'], 'checks': checks}
(FINAL / 'file-and-build-verification.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'buildId': manifest['buildId'], 'checks': len(checks),
                  'failures': [r['check'] for r in checks if r['status'] != 'PASS']}))
sys.exit(1 if any(r['status'] != 'PASS' for r in checks) else 0)

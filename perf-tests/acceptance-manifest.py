import hashlib, json, subprocess
from pathlib import Path
from datetime import datetime, timezone
root = Path(__file__).resolve().parent.parent
target = root/'docs/acceptance/build-manifest.json'
previous = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {}
paths = sorted(p for base in ['backend','frontend','shared'] for p in (root/base).rglob('*') if p.is_file() and not any(x in p.relative_to(root).parts for x in ['node_modules','.cache','dist','uploads','scripts','tests']) and p.suffix in ['.js','.jsx','.json','.css','.svg','.html','.png','.mjs'])
files = {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
digest = hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()
previous.update(baseCommit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),buildId='8a904fb-acceptance-'+digest[:12],sourceSHA256=digest,files=files,bundle={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'frontend/dist').rglob('*') if p.is_file()},evidenceStartAt=datetime.now(timezone.utc).isoformat())
target.write_text(json.dumps(previous,indent=2),encoding='utf-8')
print(previous['buildId'])

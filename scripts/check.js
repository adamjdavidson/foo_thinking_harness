import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
let failed = false;
for (const dir of ['src', 'public', 'scripts', 'test']) {
  for (const file of readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
    if (result.status !== 0) failed = true;
  }
}
const hash = createHash('sha256').update(readFileSync('proposal.html')).digest('hex');
if (hash !== '788c5bf436e11810f4686ffb2dd4957a4e99687244338a94bb7769101df5aba2') { console.error('proposal.html differs from its original source copy.'); failed = true; }
if (failed) process.exitCode = 1;
else console.log('JavaScript syntax checked; proposal.html is unchanged.');

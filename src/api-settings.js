import { readFileSync, writeFileSync, renameSync, rmSync, chmodSync } from 'node:fs';

// Never served by HTTP or included in conversation exports.
export class ApiSettings {
  constructor(path) { this.path = path; }
  load(fallback) {
    let saved;
    try { saved = JSON.parse(readFileSync(this.path, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error('Cannot read saved API settings. Check the local settings file.'); }
    if (saved.mode !== 'live' || typeof saved.key !== 'string' || !saved.key.startsWith('sk-') || !Number.isFinite(saved.budget) || saved.budget <= 0) throw new Error('Saved API settings are invalid.');
    chmodSync(this.path, 0o600);
    return saved;
  }
  save(settings) {
    const temporary = this.path + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify(settings) + '\n', { mode: 0o600 });
      chmodSync(temporary, 0o600);
      renameSync(temporary, this.path);
    } catch {
      rmSync(temporary, { force: true });
      throw new Error('Could not save API settings on this computer. The previous configuration is unchanged.');
    }
  }
}

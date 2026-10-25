import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { DEFAULT_CONTROLS } from '../public/controls.js';
import { DEFAULT_MODE, validateMode } from '../public/modes.js';

export class Store {
  constructor(path, { recover = true } = {}) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, controls TEXT NOT NULL, updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (id TEXT PRIMARY KEY, conversation TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS spend (id TEXT PRIMARY KEY, dollars REAL NOT NULL, kind TEXT NOT NULL, settled INTEGER NOT NULL DEFAULT 0);
    `);
    if (!this.db.prepare('PRAGMA table_info(conversations)').all().some(column => column.name === 'partnershipMode')) {
      this.db.exec("ALTER TABLE conversations ADD COLUMN partnershipMode TEXT NOT NULL DEFAULT 'play'");
    }
    // Older databases used the id "kim" for the Influencer mode; carry conversations and turn snapshots forward.
    this.db.exec(`UPDATE conversations SET partnershipMode='influencer' WHERE partnershipMode='kim';
      UPDATE turns SET data=json_set(data,'$.partnershipMode','influencer') WHERE json_extract(data,'$.partnershipMode')='kim';`);
    if (recover) this.recoverInterrupted();
  }
  recoverInterrupted() {
    // A restart never replays a request that might already have been billed.
    for (const row of this.db.prepare("SELECT id,data FROM turns WHERE status='pending'").all()) {
      const turn = JSON.parse(row.data);
      this.saveTurn({ ...turn, status: 'failed', error: 'The server restarted during this turn. It was not retried. Any API reservation is retained.' });
    }
  }
  list() { return this.db.prepare('SELECT id,title,updated FROM conversations ORDER BY updated DESC').all(); }
  create(controls = DEFAULT_CONTROLS, partnershipMode = DEFAULT_MODE) {
    validateMode(partnershipMode);
    const id = randomUUID();
    this.db.prepare('INSERT INTO conversations (id,title,controls,updated,partnershipMode) VALUES (?,?,?,?,?)').run(id, 'New conversation', JSON.stringify(controls), new Date().toISOString(), partnershipMode);
    return this.get(id);
  }
  get(id) {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id=?').get(id);
    if (!row) return null;
    return { ...row, controls: JSON.parse(row.controls), turns: this.db.prepare('SELECT data FROM turns WHERE conversation=? ORDER BY rowid').all(id).map(x => JSON.parse(x.data)) };
  }
  controls(id, controls) { this.db.prepare('UPDATE conversations SET controls=?,updated=? WHERE id=?').run(JSON.stringify(controls), new Date().toISOString(), id); }
  partnershipMode(id, mode) { this.db.prepare('UPDATE conversations SET partnershipMode=?,updated=? WHERE id=?').run(validateMode(mode), new Date().toISOString(), id); }
  settings(id, controls, mode) { this.db.prepare('UPDATE conversations SET controls=?,partnershipMode=?,updated=? WHERE id=?').run(JSON.stringify(controls), validateMode(mode), new Date().toISOString(), id); }
  turn(id) { const row = this.db.prepare('SELECT data FROM turns WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  saveTurn(turn) {
    this.db.prepare('INSERT INTO turns VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data').run(turn.id, turn.conversation, turn.status, JSON.stringify(turn), turn.created);
    this.db.prepare('UPDATE conversations SET updated=? WHERE id=?').run(new Date().toISOString(), turn.conversation);
    if (turn.text) this.db.prepare("UPDATE conversations SET title=? WHERE id=? AND title='New conversation'").run(turn.text.slice(0, 70), turn.conversation);
  }
  spent() { return this.db.prepare('SELECT COALESCE(SUM(dollars),0) AS total FROM spend').get().total; }
  reserve(id, dollars, kind, budget) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!(budget > 0) || this.spent() + dollars > budget) throw new Error('The remaining pilot budget is too small for this request. No API request was sent.');
      this.db.prepare('INSERT INTO spend(id,dollars,kind) VALUES (?,?,?)').run(id, dollars, kind);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  settle(id, dollars) { this.db.prepare('UPDATE spend SET dollars=?,settled=1 WHERE id=?').run(dollars, id); }
  close() { this.db.close(); }
}

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const atomic = require('./atomic_persistence.cjs');

const dir = path.join('/tmp', 'marketsphere-atomic-persistence-test');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const cp = path.join(dir, 'checkpoints.json');
atomic.atomicWriteJsonSync(cp, [{ id: 'CP1', wal_seq: 2400 }]);
assert.equal(JSON.parse(fs.readFileSync(cp, 'utf8'))[0].id, 'CP1');

atomic.atomicWriteJsonSync(cp, [{ id: 'CP2', wal_seq: 2401 }]);
assert.equal(JSON.parse(fs.readFileSync(cp, 'utf8'))[0].id, 'CP2');
assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')).length, 0);

const wal = path.join(dir, 'evidence.wal.jsonl');
atomic.appendJsonlRecordSync(wal, { seq: 1, id: 'A' });
atomic.appendJsonlRecordSync(wal, { seq: 2, id: 'B' });
const raw = fs.readFileSync(wal, 'utf8');
assert(raw.endsWith('\n'));
const rows = raw.trimEnd().split('\n').map(JSON.parse);
assert.deepStrictEqual(rows.map((r) => r.seq), [1, 2]);

console.log(JSON.stringify({
  syntax: 'PASS',
  atomic_json_replace: 'PASS',
  no_temp_leak: 'PASS',
  jsonl_append: 'PASS',
  newline_terminated: 'PASS',
  rows: rows.length,
}));

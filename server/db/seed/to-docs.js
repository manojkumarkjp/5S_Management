// Converts the generated dataset into {collection: {docId: body}} for the shared db.
const { generate } = require('./seed.js');
function toDocs(today) {
  const d = generate(today);
  const out = { cfg: { settings: d.settings, masters: d.masters, counters: d.counters } };
  ['users', 'zones', 'checksheets', 'schedules', 'workorders', 'findings', 'actions', 'improvements', 'notifications', 'logs'].forEach((c) => {
    out[c] = {}; d[c].forEach((x) => { const b = Object.assign({}, x); delete b.id; out[c][x.id] = b; });
  });
  return out;
}
module.exports = { toDocs };
if (require.main === module) {
  const fs = require('fs'); const path = require('path');
  const docs = toDocs(process.argv[2] || '2026-10-01');
  const dir = process.argv[3] || path.join(__dirname, 'docs');
  fs.rmSync(dir, { recursive: true, force: true });
  let n = 0;
  Object.entries(docs).forEach(([c, m]) => { fs.mkdirSync(path.join(dir, c), { recursive: true }); Object.entries(m).forEach(([id, b]) => { fs.writeFileSync(path.join(dir, c, id + '.json'), JSON.stringify(b)); n++; }); });
  fs.writeFileSync(path.join(__dirname, 'out', 'docs.json'), JSON.stringify(docs));
  console.log('docs', n);
}

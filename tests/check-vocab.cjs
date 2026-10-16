// 앱 태그(app.js TAG_SUGGESTIONS)와 온톨로지(procedures.jsonld appTag)가 같은지 확인한다.
// 사용법: node tests/check-vocab.cjs
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const m = js.match(/const TAG_SUGGESTIONS = \[([\s\S]*?)\];/);
if (!m) { console.error('TAG_SUGGESTIONS 를 찾지 못했어요'); process.exit(1); }
const appTags = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
const vocab = JSON.parse(fs.readFileSync(path.join(root, 'ontology/procedures.jsonld'), 'utf8'));
const ontoTags = vocab['@graph'].filter((c) => c.appTag).map((c) => c.appTag);
JSON.parse(fs.readFileSync(path.join(root, 'ontology/context.jsonld'), 'utf8'));
JSON.parse(fs.readFileSync(path.join(root, 'metadata/project.jsonld'), 'utf8'));
const onlyApp = appTags.filter((t) => !ontoTags.includes(t));
const onlyOnto = ontoTags.filter((t) => !appTags.includes(t));
if (onlyApp.length || onlyOnto.length) {
  console.error('맞지 않음\n 앱에만:', onlyApp, '\n 온톨로지에만:', onlyOnto);
  process.exit(1);
}
console.log(`OK: 태그 ${appTags.length}개가 온톨로지와 같아요`);

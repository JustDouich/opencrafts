// Vérifie que constitution.js dit la même chose que OPENCRAFTS.md (dossier parent).
// Article 07 : si les deux divergent, c'est l'app qui ment. Usage : npm run test:constitution
'use strict';

const fs = require('fs');
const path = require('path');
const c = require('../constitution');

const chemin = path.resolve(__dirname, '..', '..', 'OPENCRAFTS.md');
if (!fs.existsSync(chemin)) {
  console.log('OPENCRAFTS.md introuvable à côté de l\'app : rien à comparer (installation utilisateur).');
  process.exit(0);
}
const md = fs.readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');
// L'app met une majuscule en tête de phrase ; OPENCRAFTS.md écrit « En clair : il … ». Seule tolérance.
const plat = (s) => { const t = s.replace(/\s+/g, ' ').trim(); return t.charAt(0).toLowerCase() + t.slice(1); };
let erreurs = 0;
const verifier = (ok, msg) => { console.log(`${ok ? 'OK ' : 'KO '} ${msg}`); if (!ok) erreurs++; };

const version = (md.match(/\*\*Version (\d+\.\d+) — /g) || []).map((v) => v.match(/(\d+\.\d+)/)[1]).pop();
verifier(version === c.VERSION, `version : OPENCRAFTS.md ${version} / app ${c.VERSION}`);

for (const h of c.HARNAIS) {
  const nomMd = h.cle === 'innovation' ? 'Innovation — ÉCOUTE, verrouillé' : `${h.nom} — ${h.niveau}`;
  const i = md.indexOf(`#### ${nomMd}`);
  verifier(i >= 0, `harnais ${h.nom} = ${h.niveau}`);
  if (i < 0) continue;
  const bloc = md.slice(i, md.indexOf('\n####', i + 5) > 0 ? md.indexOf('\n####', i + 5) : md.indexOf('\n###', i + 5));
  const enClair = (bloc.match(/\*\*En clair :\*\*([\s\S]*?)(\n\n|$)/) || [])[1] || '';
  verifier(plat(enClair) === plat(h.enClair), `phrase « en clair » de ${h.nom}`);
}

verifier(/Le plafond de dépense est de 0 € pour les dix agents/.test(md) && c.PLAFOND_EUROS === 0, 'plafond 0 €');
for (const i of c.INTERDITS) verifier(md.includes(`### ${i.section} `), `section §${i.section} présente`);

console.log(erreurs ? `\n${erreurs} écart(s).` : '\nConstitution de l\'app conforme à OPENCRAFTS.md.');
process.exit(erreurs ? 1 : 0);

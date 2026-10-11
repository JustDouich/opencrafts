// Génère la paire de clés de licence OpenCrafts — à lancer UNE fois, par Douich, sur sa machine.
// La clé PRIVÉE va dans un dossier personnel, hors de tout dépôt et hors OneDrive :
//   %USERPROFILE%\.opencrafts-cle-privee\cle-privee.pem
// Elle n'est jamais affichée ni copiée ailleurs : aucun agent ne la voit. Seule la clé PUBLIQUE est
// écrite dans l'app (licence/cle-publique.pem, exclue du dépôt git par *.pem).
// Refuse d'écraser une clé privée existante : la perdre rendrait invalides toutes les licences émises.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { genererPaireDeCles } = require('./licence');

const dossierPrive = process.env.OPENCRAFTS_DOSSIER_CLE || path.join(os.homedir(), '.opencrafts-cle-privee');
const clePrivee = path.join(dossierPrive, 'cle-privee.pem');
const clePublique = process.env.OPENCRAFTS_CLE_PUBLIQUE || path.join(__dirname, 'cle-publique.pem');

if (fs.existsSync(clePrivee)) {
  console.log(`Une clé privée existe déjà (${clePrivee}). Rien n'a été modifié.`);
  process.exit(0);
}
const { clePubliquePem, clePriveePem } = genererPaireDeCles();
fs.mkdirSync(dossierPrive, { recursive: true });
fs.writeFileSync(clePrivee, clePriveePem, { encoding: 'utf8', mode: 0o600 });
fs.writeFileSync(clePublique, clePubliquePem, 'utf8');
console.log('Paire de clés créée.');
console.log(`  Clé privée (à garder pour vous, à sauvegarder sur une clé USB) : ${clePrivee}`);
console.log(`  Clé publique (embarquée dans l'app) : ${clePublique}`);

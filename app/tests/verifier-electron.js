// Vérification en Electron réel (02/10/2026) : lance la vraie app, ouvre les vues, fait une
// capture de chacune, saisit un thème dans la vraie fenêtre de saisie et déroule un craft
// complet contre une fausse fenêtre IA locale (aucun compte, aucune IA réelle contactée).
// Usage : npm run test:electron   — captures écrites dans tests/captures/.
'use strict';

process.env.OPENCRAFTS_TEST = '1';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const oc = require('../main');

const CAPTURES = path.join(__dirname, 'captures');
fs.mkdirSync(CAPTURES, { recursive: true });
let erreurs = 0;
const verifier = (ok, msg) => { console.log(`${ok ? 'OK ' : 'KO '} ${msg}`); if (!ok) erreurs++; };
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function attendrePret(win, maxMs = 8000) {
  const debut = Date.now();
  while (Date.now() - debut < maxMs) {
    if (win.isDestroyed()) return false;
    try { if (await win.webContents.executeJavaScript('document.body && document.body.dataset.pret === "1"')) return true; } catch (e) { /* page pas prête */ }
    await attendre(200);
  }
  return false;
}

async function capturer(win, nom) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(CAPTURES, nom), img.toPNG());
}

async function testerVues() {
  const constitution = oc.ouvrirVue('constitution.html');
  verifier(await attendrePret(constitution), 'vue constitution chargée');
  const nbAgents = await constitution.webContents.executeJavaScript('document.querySelectorAll(".agent").length');
  const nbInterdits = await constitution.webContents.executeJavaScript('document.querySelectorAll(".interdit").length');
  verifier(nbAgents === 10, `constitution : ${nbAgents} harnais affichés (attendu 10)`);
  verifier(nbInterdits === 9, `constitution : ${nbInterdits} interdits affichés (attendu 9)`);
  await capturer(constitution, 'constitution.png');
  constitution.close();

  const r = oc.lireChantiers();
  verifier(r.ok, `chantiers.json lu (${r.ok ? r.donnees.chantiers.length + ' chantiers' : r.raison})`);
  const vue3d = oc.ouvrirVue('chantiers-3d.html', { width: 1360, height: 860 });
  verifier(await attendrePret(vue3d), 'vue 3D chargée');
  const nbTours = await vue3d.webContents.executeJavaScript('document.querySelectorAll(".tour").length');
  verifier(r.ok && nbTours === r.donnees.chantiers.length, `vue 3D : ${nbTours} tours pour ${r.ok ? r.donnees.chantiers.length : '?'} chantiers`);
  await attendre(400);
  await capturer(vue3d, 'chantiers-3d.png');
  await vue3d.webContents.executeJavaScript('document.querySelector(".tour[data-id=electron]").click()');
  await attendre(200);
  const titre = await vue3d.webContents.executeJavaScript('document.querySelector("aside h2").textContent');
  verifier(/Electron/.test(titre), `clic sur une tour → détail « ${titre} »`);
  await capturer(vue3d, 'chantiers-3d-detail.png');
  vue3d.close();
}

async function testerSaisieEtCraft() {
  // Fausse fenêtre IA : même fonction d'entrée que les content-scripts du pont, rien d'autre.
  const fausseIA = new BrowserWindow({ width: 500, height: 400, webPreferences: { contextIsolation: false } });
  await fausseIA.loadURL('data:text/html,<title>fausse IA</title><body>fausse IA</body>');
  await fausseIA.webContents.executeJavaScript('window.recus = []; window.__opencraftsInsererDepuisElectron = (t) => { window.recus.push(t); return { ok: true }; }; true');
  oc.etat.fenetresIA.claude = fausseIA;

  const promesse = oc.demanderTheme(null);
  await attendre(1500);
  const saisie = BrowserWindow.getAllWindows().find((w) => /saisie-theme/.test(w.webContents.getURL()));
  verifier(!!saisie, 'fenêtre de saisie du thème ouverte (remplace window.prompt)');
  if (!saisie) return;
  await capturer(saisie, 'saisie-theme.png');
  await saisie.webContents.executeJavaScript('document.getElementById("theme").value = "test de recette"; document.getElementById("f").requestSubmit(); true');
  const theme = await promesse;
  verifier(theme === 'test de recette', `thème reçu par le process principal : « ${theme} »`);

  const d = await oc.pipeline.demarrer(theme);
  verifier(d.ok, 'craft démarré');
  for (let i = 1; i < 5; i++) {
    await attendre(4300); // au-delà de DELAI_MIN_ENTRE_ETAPES_MS
    oc.pipeline.surSynchronisationDetectee();
  }
  await attendre(4300);
  oc.pipeline.surSynchronisationDetectee();
  const e = oc.pipeline.etatCourant();
  const recus = await fausseIA.webContents.executeJavaScript('window.recus');
  verifier(e.termine === true, `craft terminé (${e.historique.length} étapes envoyées)`);
  verifier(recus.length === 5, `${recus.length} consignes reçues par la fenêtre IA (attendu 5)`);
  verifier(recus.every((t) => t.startsWith('[Constitution OpenCrafts v2.1')), 'chaque consigne commence par le harnais v2.1');
  verifier(/harnais APPRENTI/.test(recus[3]) && /DISTRIBUTION/.test(recus[3]), 'étape Distribution envoyée avec le harnais APPRENTI');
  fs.writeFileSync(path.join(CAPTURES, 'consignes-craft.txt'), recus.join('\n\n---\n\n'), 'utf8');
  fausseIA.close();
}

async function testerExtension() {
  verifier(oc.etat.extensionChargee, `extension pont chargée dans la session (${oc.etat.extensionErreur || 'sans erreur'})`);
  const { session } = require('electron');
  const ses = session.fromPartition('persist:opencrafts');
  const ext = ses.getAllExtensions().find((e) => /Pont Dashboard/.test(e.name));
  verifier(ext && ext.version === '0.4.0', `version de l'extension : ${ext ? ext.version : 'absente'} (attendu 0.4.0)`);
  const win = new BrowserWindow({ width: 400, height: 300, webPreferences: { session: ses, contextIsolation: true } });
  await win.loadFile(path.join(__dirname, 'fixtures', 'faux-dashboard.html'));
  await attendre(2500);
  const recus = await win.webContents.executeJavaScript('window.recusExtension');
  const presence = recus.find((m) => m.type === 'plugin-present');
  verifier(presence && presence.constitution === '2.1', `le pont s'annonce au dashboard en constitution ${presence ? presence.constitution : '—'}`);
  win.close();
}

app.whenReady().then(async () => {
  await attendre(1500);
  try {
    await testerExtension();
    await testerVues();
    await testerSaisieEtCraft();
  } catch (e) {
    verifier(false, 'exception : ' + (e && e.stack || e));
  }
  console.log(erreurs ? `\n${erreurs} échec(s).` : '\nTout est vérifié en Electron réel.');
  app.exit(erreurs ? 1 : 0);
});

// Mode SAW branché sur un dossier (10/10/2026) : lancé par le skill OpenCrafts de Claude Code avec
//   OpenCrafts.exe --saw --dossier <chemin>
// Ouvre un dashboard léger sur la droite de l'écran, qui lit les fichiers de l'OpenCrafts et anime
// les agents en direct à partir de .opencrafts/activite.jsonl (écrit par les hooks de Claude Code).
'use strict';

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = (nom) => { const i = process.argv.indexOf(nom); return i >= 0 ? process.argv[i + 1] : null; };
let dossier = path.resolve(arg('--dossier') || process.cwd());
const interne = (...p) => path.join(dossier, '.opencrafts', ...p);

app.setPath('userData', path.join(app.getPath('appData'), 'OpenCrafts-SAW'));
if (!app.requestSingleInstanceLock({ dossier })) { app.quit(); return; }

let win = null;
let positionLue = 0;
const surveillances = [];

function lire(nom, defaut = null) {
  try { return fs.readFileSync(path.join(dossier, nom), 'utf8'); } catch (e) { return defaut; }
}
function lireJson(chemin, defaut) {
  try { return JSON.parse(fs.readFileSync(chemin, 'utf8')); } catch (e) { return defaut; }
}

function lireJournal() {
  const texte = lire('JOURNAL.md', '');
  const sections = {}; let courant = null; const arbitrage = [];
  for (const ligne of texte.split(/\r?\n/)) {
    const m = ligne.match(/^## (.+)$/);
    if (m) { courant = m[1].trim(); sections[courant] = []; continue; }
    if (!courant) continue;
    if (courant.startsWith("File d'arbitrage")) {
      const a = ligne.match(/À ARBITRER\s*:\s*(.+)/);
      if (a) arbitrage.push({ texte: a[1].replace(/\s*→.*$/, '').trim(), statut: (ligne.match(/→\s*(OUI|NON|PLUS TARD)/) || [])[1] || 'EN ATTENTE' });
      continue;
    }
    const e = ligne.match(/^\*\*\[(\d{2}\/\d{2}\/\d{4})\]\*\*\s*[—-]\s*(.+)$/);
    if (e) sections[courant].push({ date: e[1], texte: e[2] });
  }
  return { sections, arbitrage };
}

function etatComplet() {
  return {
    dossier,
    etat: lireJson(interne('etat.json'), {}),
    harnais: lireJson(interne('harnais.json'), null),
    mission: (lire('MISSION.md', '') || '').split(/\r?\n/).filter((l) => l && !l.startsWith('#'))[0] || '',
    produit: lireJson(interne('produit.json'), null),
    journal: lireJournal(),
    compta: lireJson(path.join(dossier, 'comptabilite.json'), { devise: 'EUR', ecritures: [] }),
    chantiers: lireJson(path.join(dossier, 'chantiers.json'), { chantiers: [] }),
    evenements: lireEvenements(true),
  };
}

function lireEvenements(depuisDebut) {
  const chemin = interne('activite.jsonl');
  let contenu = '';
  try {
    const taille = fs.statSync(chemin).size;
    if (depuisDebut) { contenu = fs.readFileSync(chemin, 'utf8'); positionLue = taille; }
    else if (taille > positionLue) {
      const fd = fs.openSync(chemin, 'r'); const buf = Buffer.alloc(taille - positionLue);
      fs.readSync(fd, buf, 0, buf.length, positionLue); fs.closeSync(fd); positionLue = taille; contenu = buf.toString('utf8');
    } else if (taille < positionLue) { positionLue = 0; }
  } catch (e) { return []; }
  const lignes = contenu.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  return depuisDebut ? lignes.slice(-40) : lignes;
}

function surveiller() {
  surveillances.splice(0).forEach((w) => w.close());
  let minuteur = null;
  const signaler = (quoi) => {
    if (!win || win.isDestroyed()) return;
    if (quoi === 'activite') { const ev = lireEvenements(false); if (ev.length) win.webContents.send('saw:evenements', ev); return; }
    clearTimeout(minuteur);
    minuteur = setTimeout(() => win && !win.isDestroyed() && win.webContents.send('saw:etat', etatComplet()), 150);
  };
  try { fs.mkdirSync(interne(), { recursive: true }); } catch (e) { /* dossier en lecture seule : on lit quand même */ }
  try { surveillances.push(fs.watch(dossier, (t, f) => f && /\.(md|json)$/i.test(f) && signaler('fichiers'))); } catch (e) {}
  try { surveillances.push(fs.watch(interne(), (t, f) => signaler(f === 'activite.jsonl' ? 'activite' : 'fichiers'))); } catch (e) {}
  setInterval(() => signaler('activite'), 1000);           // filet : fs.watch peut manquer des écritures sous Windows
}

function marquerVivant(vivant) {
  try {
    if (vivant) fs.writeFileSync(interne('dashboard.json'), JSON.stringify({ pid: process.pid, depuis: new Date().toISOString() }));
    else fs.rmSync(interne('dashboard.json'), { force: true });
  } catch (e) { /* sans importance */ }
}

function creerFenetre() {
  const wa = screen.getPrimaryDisplay().workArea;
  const largeur = Math.max(440, Math.round(wa.width * 0.38));
  win = new BrowserWindow({
    x: wa.x + wa.width - largeur, y: wa.y, width: largeur, height: wa.height,
    minWidth: 380, minHeight: 520, alwaysOnTop: true, title: 'OpenCrafts', backgroundColor: '#100d0c',
    autoHideMenuBar: true, icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload-saw.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'vues', 'saw', 'index.html'));
  win.on('closed', () => { win = null; });
  // Captures de test (recette automatique) : OPENCRAFTS_SAW_CAPTURE = JSON [[délai_ms, code_js, fichier.png], ...]
  if (process.env.OPENCRAFTS_SAW_CAPTURE) {
    const etapes = JSON.parse(process.env.OPENCRAFTS_SAW_CAPTURE);
    win.webContents.once('did-finish-load', async () => {
      for (const [delai, code, fichier] of etapes) {
        await new Promise((r) => setTimeout(r, delai));
        if (code) await win.webContents.executeJavaScript(code).catch(() => null);
        if (fichier) fs.writeFileSync(fichier, (await win.webContents.capturePage()).toPNG());
      }
      if (process.env.OPENCRAFTS_SAW_QUITTER) app.quit();
    });
  }
}

ipcMain.handle('saw:lire', () => etatComplet());
ipcMain.handle('saw:epingler', (e, oui) => { if (win) win.setAlwaysOnTop(!!oui); return !!oui; });
ipcMain.handle('saw:ouvrir', (e, nom) => {
  const cible = path.resolve(dossier, nom || '.');
  if (!cible.startsWith(dossier)) return false;               // jamais en dehors du dossier de l'OpenCrafts
  return shell.openPath(cible).then((err) => !err);
});
// Tableau de pilotage : une décision prise dans le dashboard est écrite dans le dossier (chantiers.json,
// file d'arbitrage de JOURNAL.md) et dans .opencrafts/decisions.jsonl, que le hook de Claude Code lui
// transmet au message suivant.
function aujourdhui() { return new Date().toLocaleDateString('fr-FR'); }
function noterDecision(entree) {
  const ligne = { date: aujourdhui(), heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), ...entree };
  try { fs.mkdirSync(interne(), { recursive: true }); fs.appendFileSync(interne('decisions.jsonl'), JSON.stringify(ligne) + '\n'); } catch (e) {}
  try { fs.appendFileSync(interne('activite.jsonl'), JSON.stringify({ t: Date.now() / 1000, type: 'decision', agent: entree.agent || 'orchestrateur', texte: `vous avez décidé : ${entree.reponse} (${entree.chantier_nom || entree.chantier || 'arbitrage'})` }) + '\n'); } catch (e) {}
}
const STATUT_ACTION = { continuer: 'en-cours', debloquer: 'en-cours', pause: 'en-pause', terminer: 'termine', bloquer: 'bloque' };
ipcMain.handle('saw:decider', (e, d) => {
  if (!d || typeof d !== 'object') return false;
  if (d.type === 'arbitrage') {
    const chemin = path.join(dossier, 'JOURNAL.md');
    const lignes = (lire('JOURNAL.md', '') || '').split(/\r?\n/);
    const i = lignes.findIndex((l) => /À ARBITRER\s*:/.test(l) && !/→\s*(OUI|NON|PLUS TARD)/.test(l) && l.includes(String(d.texte || '').slice(0, 40)));
    if (i < 0 || !['OUI', 'NON', 'PLUS TARD'].includes(d.reponse)) return false;
    lignes[i] = `${lignes[i].replace(/\s+$/, '')} → ${d.reponse} (${aujourdhui()})`;
    fs.writeFileSync(chemin, lignes.join('\n'), 'utf8');
    noterDecision({ chantier: 'arbitrage', chantier_nom: "File d'arbitrage", question: d.texte, reponse: d.reponse });
    return true;
  }
  const chemin = path.join(dossier, 'chantiers.json');
  const donnees = lireJson(chemin, null);
  if (!donnees || !Array.isArray(donnees.chantiers)) return false;
  const c = donnees.chantiers.find((x) => x.id === d.chantier);
  if (!c) return false;
  if (d.type === 'decision') {
    const dec = (c.decisions || []).find((x) => x.id === d.decision);
    if (!dec || dec.statut !== 'en-attente') return false;
    Object.assign(dec, { statut: 'tranchee', reponse: String(d.reponse).slice(0, 200), le: aujourdhui() });
    if (/^(oui|débloquer|debloquer|continuer|go|valider)/i.test(dec.reponse) && ['bloque', 'a-trancher', 'en-pause'].includes(c.statut)) c.statut = 'en-cours';
    noterDecision({ chantier: c.id, chantier_nom: c.nom, agent: c.agent, question: dec.question, reponse: dec.reponse });
  } else if (d.type === 'chantier' && STATUT_ACTION[d.action]) {
    c.statut = STATUT_ACTION[d.action];
    noterDecision({ chantier: c.id, chantier_nom: c.nom, agent: c.agent, action: d.action, reponse: { continuer: 'Continuer', debloquer: 'Débloquer', pause: 'Mettre en pause', terminer: 'Terminé', bloquer: 'Bloquer' }[d.action] });
  } else return false;
  c.mis_a_jour = aujourdhui();
  fs.writeFileSync(chemin + '.tmp', JSON.stringify(donnees, null, 2), 'utf8');
  fs.renameSync(chemin + '.tmp', chemin);
  return true;
});
ipcMain.handle('saw:compta-ecrire', (e, compta) => {
  if (!compta || !Array.isArray(compta.ecritures)) return false;
  const chemin = path.join(dossier, 'comptabilite.json');
  fs.writeFileSync(chemin + '.tmp', JSON.stringify(compta, null, 2), 'utf8');
  fs.renameSync(chemin + '.tmp', chemin);
  try { fs.appendFileSync(interne('activite.jsonl'), JSON.stringify({ t: Date.now() / 1000, type: 'compta', agent: 'comptable', texte: 'comptes mis à jour dans le dashboard' }) + '\n'); } catch (err) {}
  return true;
});

app.on('second-instance', (e, argv, cwd, donnees) => {
  if (donnees && donnees.dossier && path.resolve(donnees.dossier) !== dossier) {
    marquerVivant(false); dossier = path.resolve(donnees.dossier); positionLue = 0; marquerVivant(true); surveiller();
    if (win) win.webContents.send('saw:etat', etatComplet());
  }
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
});

app.whenReady().then(() => { marquerVivant(true); creerFenetre(); surveiller(); });
app.on('window-all-closed', () => { marquerVivant(false); app.quit(); });
app.on('before-quit', () => marquerVivant(false));

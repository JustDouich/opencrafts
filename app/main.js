// OpenCrafts Desktop — SAW (Small-team Agentic Workstation)
// Point de départ du chantier Electron (tâche #82). Statut honnête : voir README.md
// de ce dossier avant de présenter quoi que ce soit comme "prêt" — Article 07.

const { app, BrowserWindow, Menu, session, shell, dialog, nativeImage, Notification, ipcMain } = require('electron');

// Mode SAW branché sur un dossier, lancé par le skill OpenCrafts de Claude Code (voir saw/saw-main.js).
if (process.argv.includes('--saw')) { require('./saw/saw-main'); return; }
const path = require('path');
const fs = require('fs');
const { creerPipeline } = require('./pipeline');
const constitution = require('./constitution');
const { ecrireCopieFraiche } = require('./licence/sauvegarde-sync');
const { verifierActivation } = require('./licence/activation');

const DASHBOARD_URL = 'https://opencrafts.company/mon-opencrafts.html';
const PARTITION = 'persist:opencrafts';
const EXTENSION_DIR = path.join(__dirname, 'extension');

const AI_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
};

/** État observable de l'app — pas d'affirmation sans preuve (Article 07). */
const etat = {
  extensionChargee: false,
  extensionErreur: null,
  fenetresIA: {},
};

// ---------------------------------------------------------------------------
// Dossier de l'OpenCrafts de l'utilisateur (02/10/2026). Il contient OPENCRAFTS.md,
// JOURNAL.md et, si l'Orchestrateur l'a écrit, chantiers.json. Mémorisé dans le dossier
// de données de l'app ; par défaut, le dossier parent de l'app s'il contient OPENCRAFTS.md
// (cas du dépôt de développement), sinon aucun.
// ---------------------------------------------------------------------------
function cheminConfig() {
  return path.join(app.getPath('userData'), 'config-opencrafts.json');
}

function lireConfig() {
  try { return JSON.parse(fs.readFileSync(cheminConfig(), 'utf8')); } catch (e) { return {}; }
}

function ecrireConfig(config) {
  fs.mkdirSync(path.dirname(cheminConfig()), { recursive: true });
  fs.writeFileSync(cheminConfig(), JSON.stringify(config, null, 2), 'utf8');
}

function dossierOpenCrafts() {
  const config = lireConfig();
  if (config.dossierOpenCrafts && fs.existsSync(config.dossierOpenCrafts)) return config.dossierOpenCrafts;
  const parent = path.resolve(__dirname, '..');
  return fs.existsSync(path.join(parent, 'OPENCRAFTS.md')) ? parent : null;
}

function lireChantiers() {
  const dossier = dossierOpenCrafts();
  if (!dossier) return { ok: false, raison: 'Aucun dossier OpenCrafts choisi.' };
  const chemin = path.join(dossier, 'chantiers.json');
  if (!fs.existsSync(chemin)) return { ok: false, raison: `Pas de chantiers.json dans ${dossier}.` };
  try {
    const donnees = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    if (donnees.format !== 'opencrafts-chantiers-v1' || !Array.isArray(donnees.chantiers)) {
      return { ok: false, raison: `${chemin} n'est pas au format opencrafts-chantiers-v1.` };
    }
    return { ok: true, chemin, donnees };
  } catch (e) {
    return { ok: false, raison: `${chemin} illisible : ${e.message}` };
  }
}

/** Fenêtre locale (vues/*.html) avec le preload en lecture seule. */
function ouvrirVue(fichier, options) {
  const win = new BrowserWindow(Object.assign({
    width: 1100,
    height: 760,
    backgroundColor: '#3a0003',
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload-vues.js'),
    },
  }, options || {}));
  win.loadFile(path.join(__dirname, 'vues', fichier));
  return win;
}

let fenetreSaisieTheme = null;
let resoudreSaisieTheme = null;

/**
 * Remplace window.prompt(), qu'Electron ne prend pas en charge : appelé dans une page, il ne
 * renvoie jamais de valeur. « Lancer un craft… » n'a donc jamais pu démarrer de craft avant ce
 * correctif (constaté à la relecture le 02/10/2026).
 */
function demanderTheme(parent) {
  if (fenetreSaisieTheme && !fenetreSaisieTheme.isDestroyed()) {
    fenetreSaisieTheme.focus();
    return Promise.resolve(null);
  }
  return new Promise((resoudre) => {
    resoudreSaisieTheme = resoudre;
    fenetreSaisieTheme = ouvrirVue('saisie-theme.html', {
      width: 560, height: 330, resizable: false, minimizable: false, maximizable: false,
      parent: parent && !parent.isDestroyed() ? parent : undefined, modal: !!parent, title: 'Lancer un craft',
    });
    fenetreSaisieTheme.on('closed', () => {
      fenetreSaisieTheme = null;
      if (resoudreSaisieTheme) { resoudreSaisieTheme(null); resoudreSaisieTheme = null; }
    });
  });
}

ipcMain.handle('oc-theme-saisi', (_event, theme) => {
  const r = resoudreSaisieTheme;
  resoudreSaisieTheme = null;
  if (r) r(typeof theme === 'string' && theme.trim() ? theme.trim() : null);
  if (fenetreSaisieTheme && !fenetreSaisieTheme.isDestroyed()) fenetreSaisieTheme.close();
  return { ok: true };
});

ipcMain.handle('oc-constitution', () => ({
  VERSION: constitution.VERSION,
  PLAFOND_EUROS: constitution.PLAFOND_EUROS,
  HARNAIS: constitution.HARNAIS,
  INTERDITS: constitution.INTERDITS,
}));

ipcMain.handle('oc-chantiers', () => lireChantiers());

/** Sauvegarde par vraies copies (OPENCRAFTS.md §5.8) vers un dossier synchronisé choisi. */
async function sauvegarderVersDossierSync(parent) {
  const dossier = dossierOpenCrafts();
  if (!dossier) {
    dialog.showMessageBox(parent, { type: 'warning', title: 'OpenCrafts — Sauvegarde', message: 'Choisissez d\'abord le dossier de votre OpenCrafts (menu OpenCrafts).' });
    return;
  }
  const config = lireConfig();
  const choix = await dialog.showOpenDialog(parent, {
    title: 'Dossier synchronisé (Drive, OneDrive, Dropbox…) où écrire les copies',
    defaultPath: config.dossierSync || undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (choix.canceled || !choix.filePaths[0]) return;
  const dossierSync = choix.filePaths[0];
  if (path.resolve(dossierSync) === path.resolve(dossier)) {
    dialog.showMessageBox(parent, { type: 'warning', title: 'OpenCrafts — Sauvegarde', message: 'Le dossier de sauvegarde doit être différent du dossier de votre OpenCrafts.' });
    return;
  }
  ecrireConfig(Object.assign(config, { dossierSync }));
  const lignes = ['OPENCRAFTS.md', 'JOURNAL.md', 'chantiers.json'].map((nom) => {
    const r = ecrireCopieFraiche(path.join(dossier, nom), dossierSync);
    return `${r.ok ? '✓' : '—'} ${nom}${r.ok ? '' : ' : ' + r.raison}`;
  });
  dialog.showMessageBox(parent, {
    type: 'info',
    title: 'OpenCrafts — Sauvegarde',
    message: `Copies écrites dans ${dossierSync} (vraies copies, jamais de lien) :\n\n${lignes.join('\n')}`,
  });
}

/**
 * État de licence (brief du 30/09). Non bloquant : tant que Douich n'a pas généré la paire de
 * clés (sa clé privée ne doit jamais passer par un agent), l'app n'a pas de clé publique et
 * ne peut rien vérifier. On le dit, sans bloquer l'usage.
 */
function etatLicence() {
  const clePublique = path.join(__dirname, 'licence', 'cle-publique.pem');
  if (!fs.existsSync(clePublique)) {
    return { ok: false, message: 'Licence non encore activée dans cette version : aucune clé publique embarquée (licence/cle-publique.pem). L\'app reste utilisable sans licence pendant l\'alpha.' };
  }
  const r = verifierActivation(path.join(app.getPath('userData'), 'activation.json'), fs.readFileSync(clePublique, 'utf8'));
  return r.ok
    ? { ok: true, message: 'Licence valide et activée sur cette machine.' }
    : { ok: false, message: `Licence non valide sur cette machine (${r.raison}).` };
}

function iconPath() {
  const p = path.join(__dirname, 'assets', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

async function chargerExtensionPont(ses) {
  if (!fs.existsSync(EXTENSION_DIR)) {
    etat.extensionErreur = `Dossier extension introuvable : ${EXTENSION_DIR}`;
    console.error('[OpenCrafts]', etat.extensionErreur);
    return;
  }
  try {
    const ext = await ses.loadExtension(EXTENSION_DIR, { allowFileAccess: true });
    etat.extensionChargee = true;
    console.log('[OpenCrafts] Extension pont chargée :', ext.id, ext.name, ext.version);
  } catch (e) {
    etat.extensionErreur = String(e && e.message ? e.message : e);
    console.error('[OpenCrafts] Échec de chargement de l\'extension pont :', etat.extensionErreur);
  }
}

function creerFenetreDashboard(ses) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#3a0003', // fond global de la charte OpenCrafts
    title: 'MON OPENCRAFTS',
    icon: iconPath(),
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload-dashboard.js'),
    },
  });

  // Contournement bug B (24-27/09/2026, décision Douich : "trouve une solution
  // de contournement" plutôt que d'attendre une piste technique précise qu'on
  // n'a pas pu se confirmer mutuellement). Hypothèse retenue : Electron chargeait
  // une copie mise en cache de mon-opencrafts.html, potentiellement antérieure aux
  // correctifs mini-menu/Éditer/Supprimer déjà publiés côté web — cohérent avec le
  // split-brain CDN déjà documenté ce sprint (edge MRS en retard sur les publications).
  // Chaque chargement au démarrage porte maintenant un paramètre unique pour ne
  // jamais servir une réponse mise en cache par un intermédiaire (CDN, proxy,
  // cache HTTP du navigateur) ; le menu "Recharger le dashboard" utilise en plus
  // reloadIgnoringCache() plutôt qu'un simple reload(). Non vérifié en Electron réel
  // (contrainte sandbox inchangée) — si le bug persiste malgré ça, c'est un vrai bug
  // de code (pas un souci de cache), à traiter différemment.
  win.loadURL(`${DASHBOARD_URL}?electron=${Date.now()}`, { extraHeaders: 'Cache-Control: no-cache\n' });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[OpenCrafts] Échec de chargement du dashboard :', code, desc, url);
  });

  // Liens externes ouverts dans le navigateur système, pas dans une fenêtre Electron non prévue.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (Object.values(AI_URLS).some((u) => url.startsWith(new URL(u).origin))) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

function creerFenetreIA(cle, ses) {
  if (etat.fenetresIA[cle] && !etat.fenetresIA[cle].isDestroyed()) {
    etat.fenetresIA[cle].focus();
    return etat.fenetresIA[cle];
  }
  const titres = { claude: 'Claude', chatgpt: 'ChatGPT', gemini: 'Gemini' };
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: `${titres[cle]} — vérification du pont…`,
    icon: iconPath(),
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL(AI_URLS[cle]);
  etat.fenetresIA[cle] = win;
  win.on('closed', () => { delete etat.fenetresIA[cle]; });

  verifierPontFenetreIA(win, cle, titres[cle]);

  return win;
}

/**
 * Statut de connexion honnête (chantier "finalisation" — statut de connexion IA).
 * Ne déclare jamais "connecté" sans preuve : on vérifie que le content script
 * du pont s'est réellement exécuté dans CETTE fenêtre (marqueur
 * window.__opencraftsPont posé par content-<ia>.js), pas seulement que
 * l'extension a été chargée dans la session (etat.extensionChargee ne
 * garantit pas qu'elle a matché cette page précise).
 * Si l'extension n'a même pas pu se charger au démarrage, inutile de sonder :
 * la réponse honnête est déjà connue et immédiate.
 */
function verifierPontFenetreIA(win, cle, titreLisible) {
  if (!etat.extensionChargee) {
    if (!win.isDestroyed()) win.setTitle(`${titreLisible} — pont NON CONNECTÉ (extension non chargée)`);
    notifierStatutPont(titreLisible, false, 'Extension pont non chargée au démarrage : ' + (etat.extensionErreur || 'raison inconnue') + '. Le dashboard ne pourra pas lui envoyer d\'instructions.');
    return;
  }

  const debut = Date.now();
  const delaiMaxMs = 8000;
  const intervalleMs = 400;

  const sonder = () => {
    if (win.isDestroyed()) return;
    win.webContents.executeJavaScript('window.__opencraftsPont || null')
      .then((marqueur) => {
        if (win.isDestroyed()) return;
        if (marqueur && marqueur.charge) {
          win.setTitle(`${titreLisible} — pont connecté ✓`);
          notifierStatutPont(titreLisible, true, 'Prêt : dès que cette conversation aura répondu une première fois avec le bloc de synchronisation, sélectionnez-la dans le menu en haut à droite du dashboard pour lui envoyer des instructions.');
          return;
        }
        if (Date.now() - debut >= delaiMaxMs) {
          win.setTitle(`${titreLisible} — pont NON DÉTECTÉ`);
          notifierStatutPont(titreLisible, false, 'Le script du pont ne répond pas sur cette page après ' + Math.round(delaiMaxMs / 1000) + 's. Le dashboard ne pourra probablement pas lui envoyer d\'instructions tant que ça persiste.');
          return;
        }
        setTimeout(sonder, intervalleMs);
      })
      .catch(() => {
        if (!win.isDestroyed() && Date.now() - debut < delaiMaxMs) setTimeout(sonder, intervalleMs);
      });
  };

  win.webContents.once('did-finish-load', () => setTimeout(sonder, 300));
}

function notifierStatutPont(titreLisible, ok, corps) {
  try {
    if (!Notification.isSupported()) return;
    new Notification({
      title: `OpenCrafts — ${titreLisible} : ${ok ? 'pont connecté' : 'pont non connecté'}`,
      body: corps,
      silent: !ok ? false : true,
    }).show();
  } catch (e) { /* notifications indisponibles sur cet OS/config : le titre de fenêtre reste la source de vérité */ }
}

function construireMenu(ses, dashboardWin) {
  const template = [
    {
      label: 'OpenCrafts',
      submenu: [
        {
          label: 'Recharger le dashboard (sans cache)',
          accelerator: 'CmdOrCtrl+R',
          click: () => dashboardWin && !dashboardWin.isDestroyed() && dashboardWin.webContents.reloadIgnoringCache(),
        },
        { type: 'separator' },
        {
          label: 'État de l\'extension pont',
          click: () => {
            const msg = etat.extensionChargee
              ? 'Extension pont chargée avec succès dans cette fenêtre Electron.'
              : `Extension pont NON chargée. Erreur : ${etat.extensionErreur || 'inconnue'}\n\n` +
                'Conséquence honnête : le champ de pilotage du dashboard affichera ' +
                '« PLUGIN NON CONNECTÉ » et basculera sur la copie presse-papier — ' +
                'comme en navigateur sans l\'extension installée. Ce n\'est pas un faux positif.';
            dialog.showMessageBox(dashboardWin, {
              type: etat.extensionChargee ? 'info' : 'warning',
              title: 'OpenCrafts — Extension pont',
              message: msg,
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Lancer un craft…',
          click: async () => {
            if (!dashboardWin || dashboardWin.isDestroyed()) return;
            const theme = await demanderTheme(dashboardWin);
            if (!theme) return; // annulé ou vide
            const resultat = await pipeline.demarrer(theme);
            if (!resultat.ok) {
              dialog.showMessageBox(dashboardWin, {
                type: 'warning',
                title: 'OpenCrafts — Craft',
                message: resultat.raison === 'craft-deja-en-cours'
                  ? 'Un craft est déjà en cours. Arrêtez-le d\'abord ("Arrêter le craft en cours") si vous voulez en lancer un autre.'
                  : `Impossible de démarrer ce craft (${resultat.raison}). Vérifiez qu'une fenêtre IA est ouverte et connectée au pont.`,
              });
            }
          },
        },
        {
          label: 'État du craft en cours…',
          click: async () => {
            if (!dashboardWin || dashboardWin.isDestroyed()) return;
            const e = pipeline.etatCourant();
            const lignes = e.historique.map((h) => `  • ${h.etape} → ${h.agent} : ${h.ok ? 'envoyé' : 'échec (' + h.raison + ')'} (${h.envoyeA})`).join('\n');
            const msg = e.theme
              ? `Thème : ${e.theme}\nÉtape actuelle : ${e.etape || '—'} (${e.etapeIndex + 1}/${e.totalEtapes})\nActif : ${e.actif ? 'oui' : 'non'}${e.termine ? ' (terminé)' : ''}${e.arretRaison ? '\nArrêté : ' + e.arretRaison : ''}\n\nHistorique :\n${lignes || '  (aucun envoi encore)'}`
              : 'Aucun craft démarré depuis le lancement de l\'application.';
            dialog.showMessageBox(dashboardWin, { type: 'info', title: 'OpenCrafts — État du craft', message: msg });
          },
        },
        {
          label: 'Arrêter le craft en cours',
          click: () => pipeline.arreter('arret-demande-menu'),
        },
        { type: 'separator' },
        {
          label: 'Vue 3D des chantiers…',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => ouvrirVue('chantiers-3d.html', { width: 1360, height: 860, title: 'Chantiers — vue 3D' }),
        },
        {
          label: `Constitution v${constitution.VERSION} — harnais et garde-fous…`,
          click: () => ouvrirVue('constitution.html', { title: 'Constitution — harnais et garde-fous' }),
        },
        { type: 'separator' },
        {
          label: 'Choisir le dossier de mon OpenCrafts…',
          click: async () => {
            const choix = await dialog.showOpenDialog(dashboardWin, {
              title: 'Dossier qui contient OPENCRAFTS.md et JOURNAL.md',
              defaultPath: dossierOpenCrafts() || undefined,
              properties: ['openDirectory'],
            });
            if (choix.canceled || !choix.filePaths[0]) return;
            const dossier = choix.filePaths[0];
            if (!fs.existsSync(path.join(dossier, 'OPENCRAFTS.md'))) {
              dialog.showMessageBox(dashboardWin, { type: 'warning', title: 'OpenCrafts', message: `Pas de OPENCRAFTS.md dans ${dossier}. Dossier non retenu.` });
              return;
            }
            ecrireConfig(Object.assign(lireConfig(), { dossierOpenCrafts: dossier }));
          },
        },
        {
          label: 'Sauvegarder dans un dossier synchronisé…',
          click: () => sauvegarderVersDossierSync(dashboardWin),
        },
        {
          label: 'Licence…',
          click: () => {
            const e = etatLicence();
            dialog.showMessageBox(dashboardWin, { type: e.ok ? 'info' : 'warning', title: 'OpenCrafts — Licence', message: e.message });
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Fenêtres IA',
      submenu: [
        { label: 'Ouvrir Claude', click: () => creerFenetreIA('claude', ses) },
        { label: 'Ouvrir ChatGPT', click: () => creerFenetreIA('chatgpt', ses) },
        { label: 'Ouvrir Gemini', click: () => creerFenetreIA('gemini', ses) },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Contournement direct du pont dashboard → IA (chantier "bugs Electron",
 * 24/09/2026, décision Douich : "contournement direct" plutôt que
 * d'intégrer electron-chrome-extensions ou de diagnostiquer plus avant).
 *
 * Diagnostic qui a mené à ce choix : la chaîne existante (dashboard →
 * postMessage → content-dashboard.js → chrome.runtime.sendMessage →
 * background.js service worker → chrome.tabs.query/sendMessage → fenêtre IA)
 * repose sur chrome.tabs, qu'Electron ne supporte pleinement que si chaque
 * BrowserWindow est explicitement enregistrée comme "tab" auprès du système
 * d'extensions (via un paquet comme electron-chrome-extensions) — ce que
 * cette app ne fait pas. Hypothèse non confirmée par un test réel (sandbox
 * sans Electron), mais cohérente avec le symptôme rapporté : ça marche dans
 * un vrai Chrome, pas ici, sans erreur visible (chrome.tabs.query renvoie
 * probablement une liste vide, le message part dans le vide).
 *
 * Ce process principal connaît déjà directement toutes les fenêtres IA
 * ouvertes (etat.fenetresIA) : on bypasse chrome.tabs entièrement pour cette
 * app, sans toucher au reste du pont (la synchronisation conversations-sync
 * via chrome.storage n'est pas concernée, elle ne dépend pas de chrome.tabs).
 *
 * Câblage : preload-dashboard.js intercepte le postMessage "push-to-chat" de
 * la page (avant que content-dashboard.js ne tente sa propre voie, cassée)
 * et appelle ce handler via ipcRenderer.invoke. On exécute alors directement
 * window.__opencraftsInsererDepuisElectron(...) dans la fenêtre IA ciblée —
 * fonction ajoutée à cet effet dans content-claude.js / content-chatgpt.js /
 * content-gemini.js, qui reprend exactement la même logique d'insertion et
 * la même vérification de conversation que le chemin chrome.runtime existant.
 */
async function envoyerAuPont(texte, idConversation) {
  if (typeof texte !== 'string' || !texte) return { envoye: false, raison: 'texte-vide' };

  const cle = idConversation ? String(idConversation).split(':')[0] : null;
  const cibles = cle
    ? (etat.fenetresIA[cle] ? [etat.fenetresIA[cle]] : [])
    : Object.values(etat.fenetresIA);

  if (cibles.length === 0) {
    return { envoye: false, raison: 'aucune-fenetre-ia-ouverte' };
  }

  let envoye = false;
  for (const win of cibles) {
    if (!win || win.isDestroyed()) continue;
    try {
      const script = `(window.__opencraftsInsererDepuisElectron ? window.__opencraftsInsererDepuisElectron(${JSON.stringify(texte)}, ${JSON.stringify(idConversation)}) : { ok: false, raison: 'pont-non-charge' })`;
      const resultat = await win.webContents.executeJavaScript(script);
      if (resultat && resultat.ok) envoye = true;
    } catch (e) {
      console.error('[OpenCrafts] Échec envoi push-to-chat (contournement direct) vers une fenêtre IA :', e);
    }
  }
  return { envoye };
}

ipcMain.handle('oc-push-to-chat', async (_event, payload) => {
  const texte = payload && payload.texte;
  const idConversation = (payload && payload.idConversation) || null;
  return envoyerAuPont(texte, idConversation);
});

/**
 * Pipeline de craft continu (Point 9, 24/09/2026) — voir pipeline.js pour le
 * cadrage complet (hybride, autonome de bout en bout, Electron seulement,
 * réutilise ce même pont, résultat simulé). Réutilise envoyerAuPont() plutôt
 * que de dupliquer la logique d'envoi.
 */
const pipeline = creerPipeline({
  envoyerAuPont,
  notifier: (titre, ok, corps) => notifierStatutPont(titre, ok, corps),
});

// Câblage préload → pipeline : preload-dashboard.js signale ici chaque
// synchronisation JOURNAL.md détectée côté pont (voir content-dashboard.js,
// événement "conversations-sync"), ce qui sert de déclencheur d'avancement
// autonome à l'étape suivante. Fire-and-forget (ipcRenderer.send / ipcMain.on)
// puisqu'aucune réponse n'est attendue par la page.
ipcMain.on('oc-sync-detectee', () => {
  pipeline.surSynchronisationDetectee();
});

ipcMain.handle('oc-craft-demarrer', async (_event, theme) => pipeline.demarrer(theme));
ipcMain.handle('oc-craft-arreter', async () => { pipeline.arreter('arret-demande-menu'); return { ok: true }; });
ipcMain.handle('oc-craft-etat', async () => pipeline.etatCourant());

app.whenReady().then(async () => {
  const ses = session.fromPartition(PARTITION);
  await chargerExtensionPont(ses);

  const dashboardWin = creerFenetreDashboard(ses);
  construireMenu(ses, dashboardWin);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      creerFenetreDashboard(ses);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !process.env.OPENCRAFTS_TEST) app.quit();
});

// Exposé pour tests/verifier-electron.js uniquement (vérification en Electron réel).
module.exports = { etat, ouvrirVue, demanderTheme, pipeline, lireChantiers, envoyerAuPont };

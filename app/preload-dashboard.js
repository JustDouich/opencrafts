// OpenCrafts Desktop — preload de la fenêtre dashboard.
// Chantier "bugs Electron" (24/09/2026) : contournement direct du pont
// dashboard → IA. Voir le commentaire au-dessus de ipcMain.handle('oc-push-to-chat', ...)
// dans main.js pour le diagnostic complet (chrome.tabs non fiable dans Electron
// sans plomberie supplémentaire).
//
// Ce script tourne dans le monde isolé du preload (contextIsolation: true),
// mais il peut observer les événements "message" du monde principal — c'est
// exactement ce que fait déjà content-dashboard.js (l'extension pont) pour
// les mêmes raisons. On s'en sert ici pour intercepter le postMessage
// "push-to-chat" AVANT que content-dashboard.js ne tente sa propre voie
// (chrome.runtime → chrome.tabs), cassée dans Electron : stopImmediatePropagation()
// empêche son listener de s'exécuter à son tour sur ce même message, pour ne
// jamais déclencher deux tentatives concurrentes ni un double résultat affiché
// à l'utilisateur.
//
// Non modifié : la synchronisation conversations-sync (chrome.storage), qui
// reste gérée par content-dashboard.js normalement — elle ne dépend pas de
// chrome.tabs et n'a pas de raison connue d'être cassée.
//
// Statut : câblé et vérifié par `node --check` uniquement. Jamais exécuté
// dans un vrai Electron (contrainte sandbox de cette session) — à tester sur
// votre machine avant de considérer le bug réglé (Article 07).
(function () {
  'use strict';

  let ipcRenderer;
  try {
    ({ ipcRenderer } = require('electron'));
  } catch (e) {
    console.error('[OpenCrafts] preload-dashboard.js : ipcRenderer indisponible, contournement inactif.', e);
    return;
  }

  // Point 9 (24/09/2026) — le pipeline de craft (main.js / pipeline.js) a
  // besoin de savoir quand l'IA connectée a répondu, pour avancer seul à
  // l'étape suivante (autonome de bout en bout, décision de Douich). On le
  // détecte via le même événement que content-dashboard.js utilise déjà pour
  // rafraîchir l'affichage ("conversations-sync", posté à chaque changement
  // de chrome.storage.opencrafts_conversations) — sans dupliquer cette
  // synchronisation, juste une notification en plus vers le process
  // principal. N'interfère pas avec le traitement normal de ce message par
  // la page ou par content-dashboard.js (pas de stopImmediatePropagation ici).
  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== 'opencrafts-extension' || d.type !== 'conversations-sync') return;
    try { ipcRenderer.send('oc-sync-detectee'); } catch (e) { /* ignore */ }
  });

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return; // on ignore les messages d'autres frames/origines
    const d = ev.data;
    if (!d || d.source !== 'opencrafts-page' || d.type !== 'push-to-chat' || !d.texte) return;

    // On coupe court ici : content-dashboard.js (l'extension) écoute le même
    // événement mais sa voie (chrome.runtime → chrome.tabs) est cassée dans
    // Electron. La laisser s'exécuter en plus ne casserait rien de visible
    // (elle échoue silencieusement), mais autant éviter le travail inutile
    // et un éventuel double postMessage de résultat.
    try { ev.stopImmediatePropagation(); } catch (e) { /* ignore */ }

    ipcRenderer
      .invoke('oc-push-to-chat', { texte: d.texte, idConversation: d.idConversation || null })
      .then(function (resultat) {
        var envoye = !!(resultat && resultat.envoye);
        window.postMessage(
          { source: 'opencrafts-extension', type: 'push-to-chat-resultat', envoye: envoye },
          '*'
        );
        // Point 2 (24/09/2026) — "dès le premier prompt envoyé depuis
        // l'interface, animer visuellement les agents sollicités". On
        // n'anime QUE si l'envoi a réellement réussi (envoye === true) :
        // jamais de mise en scène sur un échec, ce serait mentir sur ce qui
        // s'est passé (Article 07).
        if (envoye) animerAgentsSollicites();
      })
      .catch(function () {
        window.postMessage(
          { source: 'opencrafts-extension', type: 'push-to-chat-resultat', envoye: false },
          '*'
        );
      });
  });

  /**
   * Point 2 (24/09/2026) — animation des agents sollicités au premier prompt
   * envoyé (et à chaque envoi suivant). Objectif de Douich : "donner tout de
   * suite un sentiment de bon fonctionnement". Contrainte : ne pas toucher au
   * site Lovable lui-même (Point 1, abandonné/géré par Douich en direct) —
   * cette animation est donc injectée à la volée depuis Electron (CSS + JS
   * ajoutés au DOM déjà chargé), jamais dans le code source du dashboard.
   *
   * Honnêteté (Article 07) : on n'anime QUE les agents dont l'étiquette
   * affiche "actif" au moment de l'envoi — jamais un agent en pause. Ce
   * n'est pas une preuve que cet agent précis a traité la consigne (une
   * seule conversation IA reçoit le texte, pas 10 agents séparément) : c'est
   * un indicateur honnête de "ces agents sont actuellement à l'écoute", pas
   * une simulation de traitement individuel par agent.
   *
   * Fragile par nature : dépend de la structure DOM actuelle du graphe
   * (#graphNodes .graph-node[data-id], texte contenant "actif"). Le site
   * étant désormais géré par Douich en direct, cette structure peut changer
   * sans préavis — dans ce cas l'animation ne se déclenche simplement plus
   * (échec silencieux, sans erreur visible), à revérifier si Douich modifie
   * le graphe du dashboard.
   */
  var STYLE_ID = 'oc-electron-pulse-style';
  function assurerStyleInjecte() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '@keyframes oc-pulse-sollicite {' +
      '  0%   { filter: drop-shadow(0 0 0 rgba(227,18,30,0)); }' +
      '  40%  { filter: drop-shadow(0 0 6px rgba(227,18,30,0.9)); }' +
      '  100% { filter: drop-shadow(0 0 0 rgba(227,18,30,0)); }' +
      '}' +
      '.oc-agent-sollicite circle.halo, .oc-agent-sollicite circle.core {' +
      '  animation: oc-pulse-sollicite 1.4s ease-out 2;' +
      '}';
    (document.head || document.documentElement).appendChild(style);
  }

  function animerAgentsSollicites() {
    try {
      assurerStyleInjecte();
      var noeuds = document.querySelectorAll('#graphNodes .graph-node, .graph-node');
      if (!noeuds || noeuds.length === 0) return; // structure absente : on ne casse rien, on ne fait rien
      noeuds.forEach(function (noeud) {
        var texte = (noeud.textContent || '');
        var estActif = /\bactif\b/i.test(texte) && !/en pause/i.test(texte);
        if (!estActif) return;
        noeud.classList.add('oc-agent-sollicite');
        setTimeout(function () {
          noeud.classList.remove('oc-agent-sollicite');
        }, 3200);
      });
    } catch (e) {
      console.error('[OpenCrafts] animerAgentsSollicites() : structure du graphe inattendue, animation ignorée.', e);
    }
  }
})();

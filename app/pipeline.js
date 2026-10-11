// OpenCrafts Desktop — Pipeline de craft continu (Point 9, 24/09/2026)
//
// Cadrage validé par Douich avant tout code :
//  - Mécanisme : hybride — un pipeline dédié (ce fichier), qui invoque les
//    10 agents existants comme sous-étapes plutôt que de réinventer une
//    structure séparée.
//  - Exécution : autonome de bout en bout, sans validation humaine entre les
//    étapes (rapport remis a posteriori).
//  - Constitution V2.1 (02/10/2026) : chaque consigne est précédée du harnais
//    de l'agent visé (constitution.js). Les étapes ne font qu'écrire dans la
//    conversation et dans JOURNAL.md ; toute action qui sortirait du projet est
//    renvoyée dans la file d'arbitrage (« À ARBITRER : »), jamais exécutée.
//  - Périmètre : Electron uniquement — rien ici ne touche au site Lovable
//    (Point 1, abandonné, géré par Douich en direct).
//  - Moteur IA : réutilise le pont chat existant (le même mécanisme que le
//    champ "Écrivez une consigne à votre IA" du dashboard), PAS une clé API
//    séparée — décision explicite de Douich. Conséquence assumée : le
//    pipeline ne peut avancer que si une fenêtre IA est ouverte et que le
//    pont fonctionne (dépendance directe sur le contournement chrome.tabs
//    mis en place le même jour, voir main.js).
//  - "Résultat financier concret" (art. du chantier) → indicateur SIMULÉ,
//    marqué comme tel (décision de Douich). Ce fichier ne calcule ni
//    n'invente aucun chiffre : il demande explicitement à l'agent Comptable
//    d'écrire une estimation, en lui imposant de la présenter comme simulée.
//    Jamais de nombre fabriqué ici même — Article 07.
//
// Limitations honnêtes, assumées pour ce v1 :
//  - Une seule conversation ciblée à la fois (idConversation: null → diffusé
//    à toutes les fenêtres IA ouvertes ; en pratique, une seule à la fois
//    dans cette app). Pas de lecture de "conversation active" choisie dans
//    le dashboard (chrome.storage n'est pas lisible depuis ce process — voir
//    commentaire dans demarrer()).
//  - Détection de fin d'étape simplifiée : on considère qu'une étape est
//    terminée dès qu'une nouvelle synchronisation JOURNAL.md arrive côté
//    pont (conversations-sync), sans analyser le contenu de la réponse. Pas
//    de vérification que l'IA a réellement traité la bonne étape — cohérent
//    avec "autonome de bout en bout", mais à surveiller à l'usage.
//  - État en mémoire seulement : un redémarrage de l'app interrompt le
//    craft en cours sans le reprendre. Pas de file persistante pour ce v1.
//  - Jamais testé dans un vrai Electron (contrainte sandbox de cette
//    session) — vérifié uniquement par relecture et `node --check`.

const { preambuleHarnais } = require('./constitution');

const DELAI_MIN_ENTRE_ETAPES_MS = 4000; // ignore une sync trop proche de l'envoi (rebond/écho)
const DELAI_MAX_PAR_ETAPE_MS = 15 * 60 * 1000; // 15 min sans réponse → on arrête plutôt que d'attendre indéfiniment

const ETAPES = [
  {
    id: 'prototypage',
    nom: 'PROTOTYPAGE',
    agent: 'R&D / Lead Tech',
    cleAgent: 'rd',
    consigne: (theme) =>
      `Instruction pour l'agent R&D / LEAD TECH : Étape PROTOTYPAGE d'un craft sur le thème "${theme}". ` +
      `Propose 2 à 3 concepts concrets et distincts pour ce thème, puis choisis-en un à approfondir avec ` +
      `une justification courte (2-3 phrases). Ajoute une entrée dans JOURNAL.md sous ta section.`,
  },
  {
    id: 'test',
    nom: 'TEST',
    agent: 'Pivot',
    cleAgent: 'pivot',
    consigne: (theme) =>
      `Instruction pour l'agent PIVOT : Étape TEST du craft sur le thème "${theme}" (voir le concept retenu ` +
      `par R&D/Lead Tech à l'étape précédente dans JOURNAL.md). Identifie les 2 principaux risques ou ` +
      `inconnues de ce concept, et propose pour chacun une façon rapide et peu coûteuse de le vérifier. ` +
      `Ajoute une entrée dans JOURNAL.md sous ta section.`,
  },
  {
    id: 'strategie',
    nom: 'STRATÉGIE MARKETING',
    agent: 'Marketing',
    cleAgent: 'marketing',
    consigne: (theme) =>
      `Instruction pour l'agent MARKETING : Étape STRATÉGIE MARKETING du craft sur le thème "${theme}". ` +
      `À partir du concept validé (voir JOURNAL.md), propose un positionnement en une phrase, l'audience ` +
      `cible, et 2 canaux de diffusion prioritaires avec une raison courte pour chacun. Ajoute une entrée ` +
      `dans JOURNAL.md sous ta section.`,
  },
  {
    id: 'distribution',
    nom: 'DISTRIBUTION',
    agent: 'Distribution / Commercial',
    cleAgent: 'distribution',
    consigne: (theme) =>
      `Instruction pour l'agent DISTRIBUTION / COMMERCIAL : Étape DISTRIBUTION du craft sur le thème ` +
      `"${theme}". À partir de la stratégie marketing validée (voir JOURNAL.md), propose un plan concret ` +
      `de mise en marché en 3 actions maximum, réalisables sans budget significatif. Ajoute une entrée ` +
      `dans JOURNAL.md sous ta section.`,
  },
  {
    id: 'resultat',
    nom: 'RÉSULTAT',
    agent: 'Comptable',
    cleAgent: 'comptable',
    consigne: (theme) =>
      `Instruction pour l'agent COMPTABLE : Étape RÉSULTAT — clôture du craft sur le thème "${theme}". ` +
      `À partir de tout ce qui précède dans JOURNAL.md, donne une ESTIMATION SIMULÉE (pas un vrai chiffre ` +
      `de vente ni une donnée réelle — dis-le explicitement dans ta réponse) d'un ordre de grandeur de ` +
      `résultat si ce concept était lancé, et une phrase de synthèse sur si ce craft mérite d'être creusé ` +
      `plus loin ou abandonné. Ajoute une entrée dans JOURNAL.md sous ta section.`,
  },
];

/**
 * Fabrique un pipeline. Dépendances injectées depuis main.js pour ne pas
 * dupliquer la logique d'envoi déjà utilisée par ipcMain.handle('oc-push-to-chat').
 * @param {object} deps
 * @param {(texte: string, idConversation: string|null) => Promise<{envoye: boolean, raison?: string}>} deps.envoyerAuPont
 * @param {(titre: string, ok: boolean, corps: string) => void} deps.notifier
 */
function creerPipeline(deps) {
  const { envoyerAuPont, notifier } = deps;

  /** État observable, jamais affirmé sans preuve (Article 07). */
  const etat = {
    actif: false,
    theme: null,
    etapeIndex: -1,
    demarreA: null,
    dernierEnvoiA: null,
    historique: [], // [{etape, agent, envoyeA, ok}]
    termine: false,
    arretRaison: null,
  };

  let minuteurTimeout = null;

  function reinitialiser() {
    etat.actif = false;
    etat.theme = null;
    etat.etapeIndex = -1;
    etat.demarreA = null;
    etat.dernierEnvoiA = null;
    etat.historique = [];
    etat.termine = false;
    etat.arretRaison = null;
    if (minuteurTimeout) { clearTimeout(minuteurTimeout); minuteurTimeout = null; }
  }

  function planifierTimeoutEtape() {
    if (minuteurTimeout) clearTimeout(minuteurTimeout);
    minuteurTimeout = setTimeout(() => {
      if (!etat.actif) return;
      arreter('aucune-reponse-detectee-dans-le-delai');
    }, DELAI_MAX_PAR_ETAPE_MS);
  }

  async function envoyerEtape(index) {
    const etape = ETAPES[index];
    etat.etapeIndex = index;
    etat.dernierEnvoiA = Date.now();
    // Constitution V2.1 (02/10/2026) : chaque consigne porte le harnais de l'agent visé.
    const texte = preambuleHarnais(etape.cleAgent) + etape.consigne(etat.theme);
    const resultat = await envoyerAuPont(texte, null); // v1 : diffuse à la fenêtre IA ouverte (voir limitations en tête de fichier)
    etat.historique.unshift({
      etape: etape.nom,
      agent: etape.agent,
      envoyeA: new Date().toISOString(),
      ok: !!(resultat && resultat.envoye),
      raison: resultat && resultat.raison,
    });
    if (!resultat || !resultat.envoye) {
      arreter('echec-envoi-' + (resultat && resultat.raison ? resultat.raison : 'inconnu'));
      return;
    }
    planifierTimeoutEtape();
    notifier(
      `Craft — ${etape.nom}`,
      true,
      `Instruction envoyée à l'agent ${etape.agent} pour le thème "${etat.theme}". En attente de sa réponse pour enchaîner automatiquement.`
    );
  }

  /** Démarre un nouveau cycle de craft. Refuse d'en écraser un déjà en cours. */
  async function demarrer(theme) {
    if (etat.actif) {
      return { ok: false, raison: 'craft-deja-en-cours' };
    }
    if (typeof theme !== 'string' || !theme.trim()) {
      return { ok: false, raison: 'theme-vide' };
    }
    reinitialiser();
    etat.actif = true;
    etat.theme = theme.trim();
    etat.demarreA = new Date().toISOString();
    await envoyerEtape(0);
    return { ok: true };
  }

  /** Arrête le craft en cours (échec, timeout, ou demande explicite). */
  function arreter(raison) {
    if (!etat.actif) return;
    etat.actif = false;
    etat.arretRaison = raison || 'arret-demande';
    if (minuteurTimeout) { clearTimeout(minuteurTimeout); minuteurTimeout = null; }
    notifier(
      'Craft interrompu',
      false,
      `Le craft sur "${etat.theme}" s'est arrêté (${etat.arretRaison}) à l'étape ${ETAPES[etat.etapeIndex] ? ETAPES[etat.etapeIndex].nom : '?'}.`
    );
  }

  /**
   * À appeler quand le pont signale une nouvelle synchronisation JOURNAL.md
   * (l'IA connectée a répondu et republié son journal). Simplification
   * assumée : on ne vérifie pas QUE la réponse correspond bien à l'étape en
   * cours — voir "Limitations honnêtes" en tête de fichier.
   */
  function surSynchronisationDetectee() {
    if (!etat.actif) return;
    if (etat.dernierEnvoiA && Date.now() - etat.dernierEnvoiA < DELAI_MIN_ENTRE_ETAPES_MS) return; // écho probable
    const suivant = etat.etapeIndex + 1;
    if (suivant >= ETAPES.length) {
      etat.actif = false;
      etat.termine = true;
      if (minuteurTimeout) { clearTimeout(minuteurTimeout); minuteurTimeout = null; }
      notifier(
        'Craft terminé',
        true,
        `Cycle complet sur "${etat.theme}" — 5 étapes traitées (Prototypage → Test → Stratégie marketing → Distribution → Résultat). Voir JOURNAL.md de la conversation pour le détail, y compris l'estimation simulée de l'agent Comptable.`
      );
      return;
    }
    envoyerEtape(suivant);
  }

  function etatCourant() {
    return {
      actif: etat.actif,
      theme: etat.theme,
      etape: etat.etapeIndex >= 0 && ETAPES[etat.etapeIndex] ? ETAPES[etat.etapeIndex].nom : null,
      etapeIndex: etat.etapeIndex,
      totalEtapes: ETAPES.length,
      termine: etat.termine,
      arretRaison: etat.arretRaison,
      historique: etat.historique.slice(),
    };
  }

  return { demarrer, arreter, surSynchronisationDetectee, etatCourant, ETAPES };
}

module.exports = { creerPipeline, ETAPES };

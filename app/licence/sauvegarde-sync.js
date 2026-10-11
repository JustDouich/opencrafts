// OpenCrafts — sauvegarde/continuité via un dossier synchronisé (30/09/2026, brief §4).
//
// Leçon tirée à nos dépens le 30/09 côté Douich : OneDrive a cassé des liens symboliques
// (~2h perdues). Règle non négociable ici : JAMAIS de lien symbolique dans un dossier
// synchronisé (Drive/OneDrive/Dropbox/iCloud...) — uniquement de vraies copies de fichiers,
// réécrites à chaque changement significatif. Le choix du service de synchro appartient au
// client : ce module ne dépend d'aucun service en particulier, juste d'un dossier local que le
// client synchronise lui-même avec l'outil de son choix.

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Écrit une VRAIE copie fraîche d'un fichier source dans le dossier synchronisé du client.
 * Jamais un lien — fs.copyFileSync copie le contenu, pas une référence.
 * @param {string} cheminSource - ex. chemin réel de OPENCRAFTS.md / JOURNAL.md côté app.
 * @param {string} dossierSync - dossier choisi par le client (dans son Drive/OneDrive/...).
 * @returns {{ok: boolean, cheminEcrit?: string, raison?: string}}
 */
function ecrireCopieFraiche(cheminSource, dossierSync) {
  try {
    if (!fs.existsSync(cheminSource)) return { ok: false, raison: 'source-introuvable' };
    fs.mkdirSync(dossierSync, { recursive: true });
    const nomFichier = path.basename(cheminSource);
    const cheminCible = path.join(dossierSync, nomFichier);

    // Garde-fou explicite : si jamais le chemin cible est (ou devient) un lien symbolique
    // laissé par une version antérieure, on le supprime avant de réécrire une vraie copie —
    // pour ne jamais hériter d'un symlink cassé par la synchro (le bug du 30/09).
    if (fs.existsSync(cheminCible)) {
      const stat = fs.lstatSync(cheminCible);
      if (stat.isSymbolicLink()) fs.unlinkSync(cheminCible);
    }

    fs.copyFileSync(cheminSource, cheminCible);
    return { ok: true, cheminEcrit: cheminCible };
  } catch (e) {
    return { ok: false, raison: 'erreur: ' + e.message };
  }
}

/**
 * Restaure l'état de l'activité depuis le dossier synchronisé, sur un nouvel appareil.
 * Lit le fichier le plus récent qui s'y trouve et le copie (vraie copie) vers l'emplacement
 * attendu par l'app.
 * @param {string} dossierSync
 * @param {string} nomFichier - ex. "JOURNAL.md"
 * @param {string} cheminCibleApp - où l'app doit trouver ce fichier localement.
 * @returns {{ok: boolean, raison?: string}}
 */
function restaurerDepuisSync(dossierSync, nomFichier, cheminCibleApp) {
  try {
    const cheminSource = path.join(dossierSync, nomFichier);
    if (!fs.existsSync(cheminSource)) return { ok: false, raison: 'rien-a-restaurer' };
    fs.mkdirSync(path.dirname(cheminCibleApp), { recursive: true });
    fs.copyFileSync(cheminSource, cheminCibleApp);
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: 'erreur: ' + e.message };
  }
}

module.exports = { ecrireCopieFraiche, restaurerDepuisSync };

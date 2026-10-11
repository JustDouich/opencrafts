// OpenCrafts — empreinte machine pour le verrouillage de licence (30/09/2026).
//
// But (brief §3) : associer une licence à UN appareil, en local, sans serveur. Copier le
// dossier d'installation sur une autre machine doit casser la correspondance.
// Limite assumée : une empreinte basée sur du matériel/OS peut changer après un changement de
// disque ou une mise à jour OS majeure — cas à gérer par une réactivation manuelle (email à
// Douich), pas par une re-vérification automatique inventée ici.

'use strict';

const os = require('os');
const crypto = require('crypto');

/**
 * Calcule une empreinte stable de la machine (hash, pas les données brutes — on ne stocke
 * jamais le détail matériel en clair, juste de quoi comparer une machine à elle-même plus tard).
 * @returns {string} empreinte hexadécimale (sha256).
 */
function calculerEmpreinte() {
  const cpus = os.cpus();
  const elements = [
    os.hostname(),
    os.platform(),
    os.arch(),
    cpus && cpus[0] ? cpus[0].model : 'cpu-inconnu',
    String(cpus ? cpus.length : 0),
    String(os.totalmem()),
  ];
  return crypto.createHash('sha256').update(elements.join('|')).digest('hex');
}

module.exports = { calculerEmpreinte };

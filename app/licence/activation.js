// OpenCrafts — fichier d'activation local (licence + empreinte machine), 30/09/2026.
//
// Au premier lancement réussi (licence valide), on écrit un fichier local qui lie la licence
// à l'empreinte de CETTE machine. Les lancements suivants vérifient que l'empreinte correspond
// toujours — copier le dossier d'installation sur une autre machine casse cette correspondance
// (brief §3). Aucun appel réseau ici non plus.

'use strict';

const fs = require('fs');
const path = require('path');
const { verifierLicence } = require('./licence');
const { calculerEmpreinte } = require('./empreinte-machine');

/**
 * Active une licence sur cette machine : vérifie la signature, puis écrit le fichier
 * d'activation local liant licence + empreinte machine.
 * @param {string} licence
 * @param {string} clePubliquePem
 * @param {string} cheminFichierActivation
 * @returns {{ok: boolean, raison?: string}}
 */
function activer(licence, clePubliquePem, cheminFichierActivation) {
  const verif = verifierLicence(licence, clePubliquePem);
  if (!verif.valide) return { ok: false, raison: verif.raison };

  const donnees = {
    licence,
    email: verif.email,
    dateExpiration: verif.dateExpiration,
    empreinteMachine: calculerEmpreinte(),
    activeLe: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(cheminFichierActivation), { recursive: true });
  fs.writeFileSync(cheminFichierActivation, JSON.stringify(donnees, null, 2), 'utf8');
  return { ok: true };
}

/**
 * Vérifie qu'une activation existante est toujours valide sur CETTE machine (empreinte
 * inchangée + licence toujours non expirée). À appeler à chaque lancement de l'app.
 * @param {string} cheminFichierActivation
 * @param {string} clePubliquePem
 * @returns {{ok: boolean, raison?: string}}
 */
function verifierActivation(cheminFichierActivation, clePubliquePem) {
  if (!fs.existsSync(cheminFichierActivation)) {
    return { ok: false, raison: 'aucune-activation-locale' };
  }
  let donnees;
  try {
    donnees = JSON.parse(fs.readFileSync(cheminFichierActivation, 'utf8'));
  } catch (e) {
    return { ok: false, raison: 'fichier-activation-corrompu' };
  }

  const verif = verifierLicence(donnees.licence, clePubliquePem);
  if (!verif.valide) return { ok: false, raison: 'licence-invalide: ' + verif.raison };

  const empreinteActuelle = calculerEmpreinte();
  if (empreinteActuelle !== donnees.empreinteMachine) {
    return { ok: false, raison: 'machine-differente' };
  }

  return { ok: true, email: verif.email, dateExpiration: verif.dateExpiration };
}

module.exports = { activer, verifierActivation };

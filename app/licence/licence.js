// OpenCrafts — module de licence hors-ligne (30/09/2026, brief de vision).
//
// Objectif (cf. opencrafts-brief-30-09-2026.md §3) : un frein simple et efficace contre la
// diffusion "n'importe où", SANS serveur à héberger. Pas une protection inviolable — un frein
// qui décourage le partage occasionnel du grand public, pas un verrou anti-pirate expérimenté.
// Ce fichier est pur Node.js (crypto natif, aucune dépendance externe) : il ne dépend PAS
// d'Electron et est donc testable et prouvable ici, en sandbox, avant toute intégration dans
// l'app (contrairement au reste du chantier Electron, jamais vérifié en conditions réelles).
//
// Principe : à la vente, Douich (seul détenteur de la clé privée) signe un paquet
// {email, dateExpiration} avec Ed25519. L'app embarque uniquement la clé PUBLIQUE
// correspondante et peut donc vérifier la signature entièrement en local, sans jamais appeler
// de serveur. Personne d'autre que Douich ne peut fabriquer une licence valide.
//
// Limite assumée et documentée (Article 07) : un utilisateur technique déterminé qui modifie
// le binaire de l'app pour retirer l'appel à verifierLicence() contourne tout ceci. Ce n'est
// pas l'objectif — l'objectif est un frein pour le grand public visé, pas l'inviolabilité.

'use strict';

const crypto = require('crypto');

/**
 * Génère une nouvelle paire de clés Ed25519 au format PEM.
 * À exécuter UNE SEULE FOIS par Douich, hors ligne. La clé privée ne doit jamais quitter sa
 * machine ni être committée dans un dépôt (public ou privé) ; la clé publique est celle qui
 * s'embarque dans le code de l'app.
 * @returns {{clePubliquePem: string, clePriveePem: string}}
 */
function genererPaireDeCles() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    clePubliquePem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    clePriveePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

/**
 * Émet une licence signée. Réservé à Douich (nécessite la clé privée).
 * @param {string} email - email de l'acheteur, encodé dans la licence.
 * @param {string} dateExpiration - format ISO (ex. "2099-12-31") ; "9999-12-31" pour "à vie"
 *   au sens du brief (licence d'usage de la version achetée, pas une promesse de mise à jour).
 * @param {string} clePriveePem
 * @returns {string} la licence encodée en base64url, au format `<payload>.<signature>`.
 */
function emettreLicence(email, dateExpiration, clePriveePem) {
  if (!email || !dateExpiration) throw new Error('email et dateExpiration sont requis');
  const payload = JSON.stringify({ email, dateExpiration, emisLe: new Date().toISOString() });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const clePrivee = crypto.createPrivateKey(clePriveePem);
  const signature = crypto.sign(null, Buffer.from(payloadB64, 'utf8'), clePrivee);
  const signatureB64 = signature.toString('base64url');
  return `${payloadB64}.${signatureB64}`;
}

/**
 * Vérifie une licence entièrement en local (aucun appel réseau). Embarquée dans l'app avec
 * uniquement la clé PUBLIQUE.
 * @param {string} licence - la chaîne produite par emettreLicence().
 * @param {string} clePubliquePem
 * @returns {{valide: boolean, raison?: string, email?: string, dateExpiration?: string}}
 */
function verifierLicence(licence, clePubliquePem) {
  try {
    const [payloadB64, signatureB64] = String(licence).split('.');
    if (!payloadB64 || !signatureB64) return { valide: false, raison: 'format-invalide' };

    const clePublique = crypto.createPublicKey(clePubliquePem);
    const signatureOk = crypto.verify(
      null,
      Buffer.from(payloadB64, 'utf8'),
      clePublique,
      Buffer.from(signatureB64, 'base64url')
    );
    if (!signatureOk) return { valide: false, raison: 'signature-invalide' };

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const expiration = new Date(payload.dateExpiration + 'T23:59:59Z');
    if (Number.isNaN(expiration.getTime())) return { valide: false, raison: 'date-invalide' };
    if (expiration.getTime() < Date.now()) return { valide: false, raison: 'expiree' };

    return { valide: true, email: payload.email, dateExpiration: payload.dateExpiration };
  } catch (e) {
    return { valide: false, raison: 'erreur-parsing: ' + e.message };
  }
}

module.exports = { genererPaireDeCles, emettreLicence, verifierLicence };

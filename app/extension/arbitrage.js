/* OpenCrafts — Pont Dashboard : lecture de la file d'arbitrage (constitution v2.1, 02/10/2026).
 * OPENCRAFTS.md §5.7 : une action à impact qu'un agent ne peut pas faire seul entre dans la file
 * d'arbitrage. Le bloc de démarrage v2.1 demande à l'IA de la tenir en tête de JOURNAL.md, dans
 * une section « ## File d'arbitrage », une ligne « À ARBITRER : … » par demande, suivie de
 * « → OUI / → NON / → PLUS TARD » une fois tranchée. Ce fichier ne fait que lire : il ne répond
 * jamais à la place de l'humain. Chargé avant content-dashboard.js (même monde isolé) et
 * exportable sous Node pour le test.
 */
(function (racine) {
  "use strict";

  function extraireArbitrages(journal) {
    if (typeof journal !== "string") return [];
    var lignes = journal.split(/\r?\n/);
    var debut = lignes.findIndex(function (l) { return /^##\s+File d['’]arbitrage\s*$/i.test(l.trim()); });
    if (debut === -1) return [];
    var items = [];
    for (var i = debut + 1; i < lignes.length; i++) {
      var l = lignes[i].trim();
      if (/^#{1,2}\s/.test(l)) break; // section suivante
      var m = l.replace(/\*\*/g, "").replace(/^[-*]\s*/, "").match(/^(?:\[([^\]]+)\]\s*(?:—|-)?\s*)?À ARBITRER\s*:\s*(.+)$/i);
      if (!m) continue;
      var corps = m[2];
      var decision = corps.match(/→\s*(OUI|NON|PLUS TARD)\b(.*)$/i);
      items.push({
        date: m[1] || null,
        texte: (decision ? corps.slice(0, decision.index) : corps).trim(),
        statut: decision ? decision[1].toUpperCase() : "EN ATTENTE",
      });
    }
    return items;
  }

  racine.opencraftsExtraireArbitrages = extraireArbitrages;
  if (typeof module !== "undefined" && module.exports) module.exports = { extraireArbitrages: extraireArbitrages };
})(typeof window !== "undefined" ? window : globalThis);

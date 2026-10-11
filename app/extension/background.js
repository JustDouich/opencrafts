/* OpenCrafts — Pont Dashboard (prototype)
 * Service worker : relaie les demandes « push-to-chat » venant du dashboard
 * (via content-dashboard.js) vers l'onglet IA ouvert. Ne stocke rien, ne
 * contacte aucun serveur — pur relais entre deux onglets.
 *
 * Multi-conversations : le dashboard précise QUELLE conversation cibler
 * (idConversation, ex. "claude:abc-123"). On diffuse le message à tous les
 * onglets de la plateforme concernée ; chaque content script se charge
 * lui-même de vérifier que c'est bien SA conversation avant d'agir (voir
 * content-claude.js), ce qui évite d'écrire dans la mauvaise conversation
 * si plusieurs onglets de la même IA sont ouverts en même temps.
 */
var HOTES_PAR_PLATEFORME = {
  claude: "https://claude.ai/*",
  chatgpt: "https://chatgpt.com/*",
  gemini: "https://gemini.google.com/*"
};

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse){
  if(!msg || msg.type !== "push-to-chat") return;

  var plateforme = (msg.idConversation || "").split(":")[0];
  var motif = HOTES_PAR_PLATEFORME[plateforme];
  var motifs = motif ? [motif] : Object.keys(HOTES_PAR_PLATEFORME).map(function(k){ return HOTES_PAR_PLATEFORME[k]; });

  chrome.tabs.query({ url: motifs }, function(tabs){
    tabs.forEach(function(t){
      chrome.tabs.sendMessage(t.id, {
        type: "inserer-message",
        texte: msg.texte,
        idConversation: msg.idConversation || null
      }, function(){
        // On ignore chrome.runtime.lastError : un onglet sans content script
        // encore chargé (ou fermé entre-temps) ne doit pas planter le reste.
        void chrome.runtime.lastError;
      });
    });
    sendResponse({ envoye: tabs.length });
  });
  return true; // réponse asynchrone
});

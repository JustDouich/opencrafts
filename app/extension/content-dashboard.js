/* OpenCrafts — Pont Dashboard (prototype)
 * Tourne sur la page du dashboard (mon-opencrafts.html / mon-opencrafts-riche.html,
 * en local ou sur opencrafts.company). Lit les conversations synchronisées par
 * content-claude.js (une par IA/onglet, jamais une seule case globale) et les
 * relaie à la page via window.postMessage (les scripts d'extension et la page
 * ne partagent pas le même contexte JS, seul le DOM/postMessage est commun).
 *
 * Garde-fou : comme ce script s'exécute potentiellement sur n'importe quel
 * fichier local ("file:///*"), il ne fait rien tant que la page ne ressemble
 * pas au dashboard OpenCrafts (présence de #ecran-licence ou #riche-app).
 */
(function(){
  "use strict";

  function estLeDashboard(){
    return !!(document.getElementById("riche-app") || document.getElementById("ecran-licence"));
  }
  if(!estLeDashboard()) return;

  function idPlusRecent(conversations){
    var meilleur = null;
    Object.keys(conversations || {}).forEach(function(id){
      if(!meilleur || conversations[id].ts > conversations[meilleur].ts) meilleur = id;
    });
    return meilleur;
  }

  /* Envoie à la page l'état complet : toutes les conversations connues +
     laquelle est active. Si aucune n'est encore choisie côté stockage, on
     retient par défaut la plus récemment synchronisée (comportement le plus
     naturel : l'utilisateur voit tout de suite ce qu'il vient de faire). */
  function envoyerEtat(conversations, actif){
    var id = actif || idPlusRecent(conversations);
    window.postMessage({
      source: "opencrafts-extension", type: "conversations-sync",
      conversations: conversations || {}, actif: id
    }, "*");
    // Constitution v2.1 (02/10/2026) : file d'arbitrage de la conversation active, lue dans
    // son JOURNAL.md (section « ## File d'arbitrage »). Lecture seule : la page affiche, l'humain
    // tranche dans la conversation. Voir arbitrage.js.
    var conv = id && conversations && conversations[id];
    if(conv && typeof window.opencraftsExtraireArbitrages === "function"){
      window.postMessage({
        source: "opencrafts-extension", type: "arbitrage-sync", constitution: "2.1",
        idConversation: id, items: window.opencraftsExtraireArbitrages(conv.texte)
      }, "*");
    }
  }

  // Ping de présence : la page peut afficher « plugin détecté ».
  window.postMessage({ source: "opencrafts-extension", type: "plugin-present", constitution: "2.1" }, "*");

  try{
    chrome.storage.local.get(["opencrafts_conversations", "opencrafts_active"], function(data){
      envoyerEtat(data.opencrafts_conversations, data.opencrafts_active);
    });
    chrome.storage.onChanged.addListener(function(changes, zone){
      if(zone !== "local") return;
      if(changes.opencrafts_conversations || changes.opencrafts_active){
        chrome.storage.local.get(["opencrafts_conversations", "opencrafts_active"], function(data){
          envoyerEtat(data.opencrafts_conversations, data.opencrafts_active);
        });
      }
    });
  }catch(e){ /* contexte d'extension invalide : on ignore, la page reste utilisable manuellement */ }

  window.addEventListener("message", function(ev){
    if(ev.source !== window) return; // on ignore les messages d'autres frames/origines
    var d = ev.data;
    if(!d || d.source !== "opencrafts-page") return;

    // La page choisit quelle conversation afficher/piloter (sélecteur du dashboard).
    if(d.type === "set-active-conversation" && d.id){
      try{ chrome.storage.local.set({ opencrafts_active: d.id }); }catch(e){}
      return;
    }

    // Sens dashboard → chat : la page appelle window.envoyerVersChat(texte),
    // qui postMessage ici avec la conversation ciblée ; on relaie au service
    // worker, qui diffuse aux onglets concernés (chaque onglet vérifie
    // lui-même que c'est bien sa conversation avant d'agir).
    if(d.type === "push-to-chat" && d.texte){
      try{
        chrome.runtime.sendMessage({
          type: "push-to-chat", texte: d.texte, idConversation: d.idConversation || null
        }, function(reponse){
          void chrome.runtime.lastError;
          window.postMessage({
            source: "opencrafts-extension", type: "push-to-chat-resultat",
            envoye: !!(reponse && reponse.envoye)
          }, "*");
        });
      }catch(e){ /* extension déchargée : on ignore */ }
    }
  });
})();

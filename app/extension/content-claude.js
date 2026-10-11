/* OpenCrafts — Pont Dashboard (prototype)
 * Tourne sur claude.ai. Cherche, dans les réponses de l'IA, un bloc de code
 * dont la première ligne est exactement le repère ci-dessous, l'envoie au
 * dashboard (via chrome.storage.local, lu par content-dashboard.js sur
 * l'autre onglet), puis remplace le bloc par un badge discret pour ne pas
 * polluer la conversation.
 *
 * Multi-conversations : chaque conversation Claude a son propre identifiant
 * (l'URL /chat/<id>). On stocke chaque synchronisation à part, sous cet
 * identifiant, dans une liste commune à toutes les IA — jamais une seule
 * valeur globale qui écraserait tout. C'est le dashboard qui choisit
 * ensuite laquelle afficher (voir le sélecteur de conversation).
 *
 * Ce fichier ne fait QUE lire ce que Claude a déjà écrit à l'écran — il
 * n'envoie rien vers l'extérieur d'autre que chrome.storage.local, qui reste
 * sur la machine de l'utilisateur (voir OpenCrafts : zéro hébergement de
 * contenu, seules les licences sont côté serveur).
 */
(function(){
  "use strict";

  var REPERE = "OPENCRAFTS-JOURNAL-SYNC-V1";
  var PLATEFORME = "claude";
  var vus = new WeakSet();

  // Marqueur réel de chargement du pont — lu par l'app Electron (main.js,
  // via executeJavaScript) pour afficher un statut de connexion honnête.
  // Ce n'est PAS une preuve que le dashboard peut déjà cibler cette
  // conversation (il faut en plus qu'elle ait synchronisé au moins une fois,
  // voir enregistrerSync ci-dessous) — seulement que le script tourne ici.
  try{ window.__opencraftsPont = { charge: true, plateforme: PLATEFORME, ts: Date.now() }; }catch(e){}

  function idConversation(){
    // https://claude.ai/chat/<uuid> — stable pour toute la durée de la conversation.
    var m = location.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
    return PLATEFORME + ":" + (m ? m[1] : location.pathname);
  }
  function titreConversation(){
    var t = (document.title || "").replace(/\s*[-–]\s*Claude\s*$/i, "").trim();
    return t || "Conversation Claude sans titre";
  }

  function extraireJournal(texteBloc){
    var lignes = texteBloc.split(/\r?\n/);
    var i = lignes.findIndex(function(l){ return l.trim() === REPERE; });
    if(i === -1) return null;
    return lignes.slice(i+1).join("\n").trim();
  }

  function badge(){
    var b = document.createElement("div");
    b.textContent = "✓ Synchronisé avec votre dashboard OpenCrafts — cliquez pour afficher";
    b.style.cssText = "cursor:pointer;font-size:12px;color:#9a9a9a;border:1px solid #444;"
      + "padding:6px 10px;margin:6px 0;display:inline-block;border-radius:4px;";
    return b;
  }

  /* Écrit cette synchronisation dans la liste commune, sous son propre
     identifiant de conversation, sans toucher aux autres conversations déjà
     connues (autres onglets Claude, ou d'autres IA plus tard). */
  function enregistrerSync(journal){
    try{
      chrome.storage.local.get("opencrafts_conversations", function(data){
        var toutes = (data && data.opencrafts_conversations) || {};
        var id = idConversation();
        toutes[id] = {
          texte: journal, ts: Date.now(),
          titre: titreConversation(), plateforme: PLATEFORME, url: location.href
        };
        chrome.storage.local.set({ opencrafts_conversations: toutes });
      });
    }catch(e){ /* extension déchargée ou contexte invalide : on ignore */ }
  }

  function traiterBloc(pre){
    if(vus.has(pre)) return;
    var texte = pre.textContent || "";
    var journal = extraireJournal(texte);
    if(journal === null) return;
    vus.add(pre);

    enregistrerSync(journal);

    // Wrapper visuel de Claude autour du <pre> : on le masque, on met un badge
    // cliquable à la place plutôt que de supprimer l'information.
    var enveloppe = pre.closest("div.relative") || pre.parentElement;
    var cible = enveloppe || pre;
    var b = badge();
    cible.style.display = "none";
    b.addEventListener("click", function(){
      var masque = cible.style.display === "none";
      cible.style.display = masque ? "" : "none";
      b.textContent = masque
        ? "✓ Synchronisé — cliquez pour masquer"
        : "✓ Synchronisé avec votre dashboard OpenCrafts — cliquez pour afficher";
    });
    if(cible.parentElement) cible.parentElement.insertBefore(b, cible);
  }

  function scanner(){
    document.querySelectorAll("pre").forEach(traiterBloc);
  }

  /* Claude écrit sa réponse progressivement (streaming) : si on scanne à
     chaque mutation DOM, on risque de capturer le bloc alors que le repère
     vient tout juste d'apparaître mais que le JOURNAL.md qui le suit n'est
     pas encore entièrement écrit — on enverrait alors une version tronquée
     au dashboard, une seule fois (vus.add), sans jamais se corriger. On
     attend donc un court silence dans le flux avant de lire. */
  var minuteurScan = null;
  function planifierScan(){
    clearTimeout(minuteurScan);
    minuteurScan = setTimeout(scanner, 900);
  }
  var observateur = new MutationObserver(function(){ planifierScan(); });
  observateur.observe(document.body, { childList: true, subtree: true, characterData: true });
  scanner();

  // Sens dashboard → chat : le service worker relaie ici un message à insérer
  // et envoyer dans la conversation — mais seulement si CETTE conversation
  // est bien celle ciblée (sinon on insérerait dans la mauvaise conversation
  // si plusieurs onglets Claude sont ouverts en même temps).
  chrome.runtime.onMessage.addListener(function(msg){
    if(!msg || msg.type !== "inserer-message" || !msg.texte) return;
    if(msg.idConversation && msg.idConversation !== idConversation()) return;
    insererEtEnvoyer(msg.texte);
  });

  function insererEtEnvoyer(texte){
    var champ = document.querySelector('div[contenteditable="true"]');
    if(!champ) return;
    champ.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    document.execCommand("insertText", false, texte);
    setTimeout(function(){
      var boutons = Array.prototype.slice.call(document.querySelectorAll("button"));
      var envoyer = boutons.find(function(b){
        var lbl = b.getAttribute("aria-label") || "";
        return /envoyer|send/i.test(lbl);
      });
      if(envoyer && !envoyer.disabled) envoyer.click();
    }, 150);
  }

  // Contournement Electron (chantier "bugs Electron", 24/09/2026) : chrome.tabs
  // n'étant pas fiable dans Electron sans plomberie supplémentaire (voir
  // ipcMain.handle('oc-push-to-chat', ...) dans electron-opencrafts/main.js),
  // le process principal appelle directement cette fonction via
  // executeJavaScript plutôt que de passer par chrome.runtime.onMessage +
  // chrome.tabs.sendMessage. Même vérification de conversation que le chemin
  // chrome.runtime existant ci-dessus, pour ne jamais écrire dans la mauvaise
  // conversation. Sans effet en navigateur normal (rien n'appelle cette
  // fonction là-bas) — n'existe que pour ce cas Electron précis.
  window.__opencraftsInsererDepuisElectron = function(texte, idConversationAttendue){
    if(idConversationAttendue && idConversationAttendue !== idConversation()) return { ok: false, raison: 'conversation-differente' };
    insererEtEnvoyer(texte);
    return { ok: true };
  };
})();

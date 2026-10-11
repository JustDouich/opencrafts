/* OpenCrafts — Pont Dashboard (prototype)
 * Tourne sur gemini.google.com. Même principe que content-claude.js /
 * content-chatgpt.js : cherche un bloc de code dont la première ligne est le
 * repère OPENCRAFTS-JOURNAL-SYNC-V1, l'envoie au dashboard via
 * chrome.storage.local, le masque derrière un badge.
 *
 * Vérifié en direct sur gemini.google.com le 16/09/2026, SANS être connecté
 * (je n'ai pas de compte Google à utiliser à la place de Douich) :
 *  - le compositeur est bien un <div contenteditable="true"
 *    aria-label="Enter a prompt for Gemini"> (Quill) — même technique
 *    d'insertion que sur claude.ai (execCommand insertText).
 *  - le bouton d'envoi porte bien aria-label="Send message" (couvert par le
 *    même repère /envoyer|send/i que les deux autres plateformes).
 * Point NON vérifié, à confirmer par un premier test réel de Douich (voir
 * README, section « Limite connue ») : le rendu exact d'une vraie réponse
 * de Gemini (Google exige une connexion pour aller au-delà de l'aperçu). On
 * s'appuie ici sur le même choix que pour les deux autres IA — un
 * <pre><code>...</code></pre> standard — parce que c'est le rendu Markdown le
 * plus répandu et que la détection ne dépend d'aucune classe CSS spécifique
 * à Google ; si Gemini utilise un rendu different (ex. un composant custom
 * sans <pre>), ce fichier devra être ajusté après un premier test réel.
 */
(function(){
  "use strict";

  var REPERE = "OPENCRAFTS-JOURNAL-SYNC-V1";
  var PLATEFORME = "gemini";
  var vus = new WeakSet();

  // Marqueur réel de chargement du pont — lu par l'app Electron (main.js,
  // via executeJavaScript) pour afficher un statut de connexion honnête.
  // Ce n'est PAS une preuve que le dashboard peut déjà cibler cette
  // conversation (il faut en plus qu'elle ait synchronisé au moins une fois,
  // voir enregistrerSync ci-dessous) — seulement que le script tourne ici.
  try{ window.__opencraftsPont = { charge: true, plateforme: PLATEFORME, ts: Date.now() }; }catch(e){}

  function idConversation(){
    // gemini.google.com/app/<id> une fois une conversation ouverte.
    var m = location.pathname.match(/\/app\/([a-zA-Z0-9_-]+)/);
    return PLATEFORME + ":" + (m ? m[1] : location.pathname);
  }
  function titreConversation(){
    var t = (document.title || "").replace(/^[‎‏]*/, "")
      .replace(/\s*[-–]\s*Google\s*Gemini\s*$/i, "").trim();
    if(!t || /gemini/i.test(t)) return "Conversation Gemini sans titre";
    return t;
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

    var b = badge();
    pre.style.display = "none";
    b.addEventListener("click", function(){
      var masque = pre.style.display === "none";
      pre.style.display = masque ? "" : "none";
      b.textContent = masque
        ? "✓ Synchronisé — cliquez pour masquer"
        : "✓ Synchronisé avec votre dashboard OpenCrafts — cliquez pour afficher";
    });
    if(pre.parentElement) pre.parentElement.insertBefore(b, pre);
  }

  function scanner(){
    document.querySelectorAll("pre").forEach(traiterBloc);
  }

  var minuteurScan = null;
  function planifierScan(){
    clearTimeout(minuteurScan);
    minuteurScan = setTimeout(scanner, 900);
  }
  var observateur = new MutationObserver(function(){ planifierScan(); });
  observateur.observe(document.body, { childList: true, subtree: true, characterData: true });
  scanner();

  chrome.runtime.onMessage.addListener(function(msg){
    if(!msg || msg.type !== "inserer-message" || !msg.texte) return;
    if(msg.idConversation && msg.idConversation !== idConversation()) return;
    insererEtEnvoyer(msg.texte);
  });

  function insererEtEnvoyer(texte){
    var champ = document.querySelector('[aria-label="Enter a prompt for Gemini"], div[contenteditable="true"]');
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
  // chrome.runtime existant ci-dessus. Sans effet en navigateur normal.
  window.__opencraftsInsererDepuisElectron = function(texte, idConversationAttendue){
    if(idConversationAttendue && idConversationAttendue !== idConversation()) return { ok: false, raison: 'conversation-differente' };
    insererEtEnvoyer(texte);
    return { ok: true };
  };
})();

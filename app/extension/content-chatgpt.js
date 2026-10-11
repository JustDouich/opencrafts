/* OpenCrafts — Pont Dashboard (prototype)
 * Tourne sur chatgpt.com. Même principe que content-claude.js : cherche un
 * bloc de code dont la première ligne est le repère OPENCRAFTS-JOURNAL-SYNC-V1,
 * l'envoie au dashboard via chrome.storage.local, le masque derrière un badge.
 *
 * Vérifié en direct sur chatgpt.com (16/09/2026) : la réponse rend bien un
 * <pre><code>...</code></pre> classique (classes StyleX générées, aucune ne
 * sert de repère — on ne s'appuie que sur querySelectorAll("pre") + le texte,
 * exactement comme sur claude.ai). Le compositeur est un <textarea
 * id="mobile-composer-prompt" name="prompt"> (React contrôlé : il faut passer
 * par le setter natif de value + un événement "input" pour que React voie le
 * changement, un simple .value = ... est ignoré). Le bouton d'envoi porte
 * aria-label="Send message" (ou "Envoyer le message" en français).
 *
 * Comme sur Claude, l'identifiant de conversation vient de l'URL : ChatGPT
 * utilise /c/<uuid> pour un utilisateur connecté et /uc/<uuid> pour une
 * conversation anonyme (vérifié en direct) — les deux sont acceptés.
 */
(function(){
  "use strict";

  var REPERE = "OPENCRAFTS-JOURNAL-SYNC-V1";
  var PLATEFORME = "chatgpt";
  var vus = new WeakSet();

  // Marqueur réel de chargement du pont — lu par l'app Electron (main.js,
  // via executeJavaScript) pour afficher un statut de connexion honnête.
  // Ce n'est PAS une preuve que le dashboard peut déjà cibler cette
  // conversation (il faut en plus qu'elle ait synchronisé au moins une fois,
  // voir enregistrerSync ci-dessous) — seulement que le script tourne ici.
  try{ window.__opencraftsPont = { charge: true, plateforme: PLATEFORME, ts: Date.now() }; }catch(e){}

  function idConversation(){
    var m = location.pathname.match(/\/(?:c|uc)\/([a-zA-Z0-9-]+)/);
    return PLATEFORME + ":" + (m ? m[1] : location.pathname);
  }
  function titreConversation(){
    var t = (document.title || "").replace(/\s*[-–]\s*ChatGPT\s*$/i, "").trim();
    if(!t || /chatgpt/i.test(t)) return "Conversation ChatGPT sans titre";
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

    var enveloppe = pre.closest("div.markdown") || pre.parentElement;
    var cible = enveloppe && enveloppe !== pre ? pre : pre; // ChatGPT n'a pas de wrapper fiable dédié : on masque le <pre> lui-même
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
    var champ = document.querySelector('#prompt-textarea, textarea[name="prompt"], div[contenteditable="true"]');
    if(!champ) return;
    champ.focus();
    if(champ.tagName === "TEXTAREA"){
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(champ, texte);
      champ.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      document.execCommand("insertText", false, texte);
    }
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

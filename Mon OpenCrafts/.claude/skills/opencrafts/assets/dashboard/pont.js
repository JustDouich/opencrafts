// Pont entre la page du dashboard et les fichiers de l'OpenCrafts, sans application à installer.
//
// Deux modes, choisis tout seuls :
//  - « direct » (Claude Code sur l'ordinateur) : la page est servie par scripts/serveur.py ; elle relit les
//    événements chaque seconde et l'état quand un fichier change. Les décisions et la compta s'écrivent
//    dans le dossier, et le hook de Claude Code les lui transmet au message suivant.
//  - « instantané » (claude.ai, téléphone) : l'état est intégré dans la page (window.__OPENCRAFTS_ETAT__,
//    écrit par scripts/instantane.py). Rien ne s'écrit : un clic sur une décision prépare la phrase à
//    envoyer à Claude.
// Même interface que l'ancienne app Windows (window.saw), pour que la page reste identique.
'use strict';
(() => {
  const instantane = window.__OPENCRAFTS_ETAT__;
  // Le bouton « garder au premier plan » n'a de sens que dans l'app Windows ; et si le serveur s'arrête,
  // on le dit au lieu de montrer un dashboard figé comme s'il était en direct.
  const style = document.createElement('style');
  style.textContent =
    '#epingle{display:none!important}' +
    'html.pont-coupe body::after{content:"Dashboard déconnecté : dites « mon OpenCrafts » à Claude pour le relancer.";position:fixed;left:12px;right:12px;bottom:12px;z-index:98;background:#3a1d14;color:#ffd9c7;border-radius:10px;padding:10px 12px;font:13px/1.4 Inter Tight,system-ui,sans-serif}';
  document.head.appendChild(style);
  const surEtat = [];
  const surEvenements = [];

  function bandeau(texte, copier) {
    let b = document.getElementById('pont-bandeau');
    if (!b) {
      b = document.createElement('div');
      b.id = 'pont-bandeau';
      b.setAttribute('role', 'status');
      b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99;background:#1c1714;color:#f5efe6;border:1px solid #e8622c;border-radius:12px;padding:12px 14px;font:14px/1.4 Inter Tight,system-ui,sans-serif;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
      document.body.appendChild(b);
    }
    b.innerHTML = '';
    const t = document.createElement('span');
    t.style.flex = '1';
    t.textContent = texte;
    b.appendChild(t);
    if (copier) {
      const bouton = document.createElement('button');
      bouton.textContent = 'Copier';
      bouton.style.cssText = 'background:#e8622c;color:#140f0c;border:0;border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer';
      bouton.onclick = () => {
        (navigator.clipboard ? navigator.clipboard.writeText(copier) : Promise.reject())
          .then(() => { bouton.textContent = 'Copié'; })
          .catch(() => { const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
      };
      b.appendChild(bouton);
    }
    const fermer = document.createElement('button');
    fermer.textContent = '×';
    fermer.setAttribute('aria-label', 'Fermer');
    fermer.style.cssText = 'background:none;border:0;color:inherit;font-size:20px;cursor:pointer';
    fermer.onclick = () => b.remove();
    b.appendChild(fermer);
  }

  function phraseDecision(d) {
    if (d.type === 'arbitrage') return `Arbitrage « ${String(d.texte).slice(0, 80)} » : ${d.reponse}`;
    if (d.type === 'chantier') return `Chantier ${d.chantier} : ${d.action}`;
    return `Chantier ${d.chantier}, décision ${d.decision} : ${d.reponse}`;
  }

  if (instantane) {
    document.documentElement.classList.add('mode-instantane');
    // Pas de faux « en direct » : on affiche l'heure de l'instantané.
    document.addEventListener('DOMContentLoaded', () => {
      const d = document.querySelector('.direct');
      if (d) d.innerHTML = `<i style="background:#8a8079;animation:none"></i>instantané · ${new Date(instantane.genere_le || Date.now()).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    });
    window.saw = {
      lire: async () => instantane,
      epingler: async () => false,
      ouvrir: async (nom) => { bandeau(`Le fichier ${nom} est dans votre dossier OpenCrafts.`); return false; },
      ecrireCompta: async () => { bandeau('Écriture notée dans cette page. Pour l\'enregistrer, demandez au Comptable dans la conversation.'); return false; },
      decider: async (d) => { const p = phraseDecision(d); bandeau(`Envoyez à Claude : « ${p} »`, p); return false; },
      harnais: async (h) => {
        const p = ['Mets à jour mon harnais', h.nom && `produit : ${h.nom}`, h.contexte && `contexte : ${h.contexte}`, h.ajout && `précision : ${h.ajout}`].filter(Boolean).join(' ; ');
        bandeau(`Envoyez à Claude : « ${p.slice(0, 160)}${p.length > 160 ? '…' : ''} »`, p);
        return false;
      },
      surEtat: () => {},
      surEvenements: () => {},
    };
    return;
  }

  const poster = (chemin, corps) =>
    fetch(chemin, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenCrafts': '1' }, body: JSON.stringify(corps) })
      .then((r) => r.json()).then((r) => !!r.ok).catch(() => false);

  let position = 0;
  let signature = '';
  async function lire() {
    const etat = await fetch('/api/etat', { cache: 'no-store' }).then((r) => r.json());
    position = etat.position || 0;
    signature = etat.signature || '';
    return etat;
  }
  async function battre() {
    try {
      const ev = await fetch(`/api/evenements?depuis=${position}`, { cache: 'no-store' }).then((r) => r.json());
      if (ev.position < position) position = 0;
      else position = ev.position;
      if (ev.evenements && ev.evenements.length) surEvenements.forEach((fn) => fn(ev.evenements));
      const e = await fetch(`/api/etat?signature=${signature}`, { cache: 'no-store' }).then((r) => r.json());
      if (!e.inchange) {
        signature = e.signature || '';
        surEtat.forEach((fn) => fn(e));
      }
      document.documentElement.classList.remove('pont-coupe');
    } catch (err) {
      document.documentElement.classList.add('pont-coupe');
    }
    setTimeout(battre, 1000);
  }
  setTimeout(battre, 1000);

  window.saw = {
    lire,
    epingler: async () => false,
    ouvrir: (nom) => poster('/api/ouvrir', { nom }),
    ecrireCompta: (compta) => poster('/api/compta', compta),
    decider: (d) => poster('/api/decider', d),
    harnais: (h) => poster('/api/harnais', h),
    surEtat: (fn) => surEtat.push(fn),
    surEvenements: (fn) => surEvenements.push(fn),
  };
})();

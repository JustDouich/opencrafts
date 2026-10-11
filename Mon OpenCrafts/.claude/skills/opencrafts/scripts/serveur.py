"""Dashboard OpenCrafts sans application à installer : un petit serveur local (Python seul, aucune dépendance)
qui sert la page du dashboard et la branche sur les fichiers de ce dossier, en direct.

Claude Code l'affiche dans son panneau navigateur, à droite de la conversation. Même page, mêmes écrans que
l'ancienne app Windows (constellation, intérieur des agents, compta, tableau de pilotage).

Sécurité :
  - n'écoute que sur 127.0.0.1 (jamais le réseau) et refuse tout autre nom d'hôte (pas de « DNS rebinding ») ;
  - toute écriture exige l'en-tête X-OpenCrafts (une page d'un autre site ne peut pas l'envoyer sans
    autorisation, que ce serveur ne donne jamais) ;
  - ne lit et n'écrit que dans le dossier de l'OpenCrafts : chantiers.json, comptabilite.json, la file
    d'arbitrage de JOURNAL.md, .opencrafts/.

Usage : python serveur.py [--port 5190]       (s'arrête avec Ctrl+C)
        python serveur.py etat                (affiche l'adresse si le serveur tourne)
"""
import argparse
import hashlib
import json
import os
import re
import socket
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import harnais as harnais_produit
from commun import SKILL, dossier, ecrire_json, interne, lire_json

PORT_DEFAUT = 5190
PAGE = os.path.join(SKILL, 'assets', 'dashboard', 'index.html')
PONT = os.path.join(SKILL, 'assets', 'dashboard', 'pont.js')
HOTES = {'127.0.0.1', 'localhost'}


def lire_texte(nom, defaut=''):
    try:
        with open(os.path.join(dossier(), nom), encoding='utf-8') as f:
            return f.read()
    except OSError:
        return defaut


def aujourdhui():
    return datetime.now().strftime('%d/%m/%Y')


# --- Lecture de l'état (même contrat que l'ancienne app, cf. saw-main.js) -------------------------------

def lire_journal():
    sections, courant, arbitrage = {}, None, []
    for ligne in lire_texte('JOURNAL.md').splitlines():
        m = re.match(r'^## (.+)$', ligne)
        if m:
            courant = m.group(1).strip()
            sections[courant] = []
            continue
        if not courant:
            continue
        if courant.startswith("File d'arbitrage"):
            a = re.search(r'À ARBITRER\s*:\s*(.+)', ligne)
            if a:
                statut = re.search(r'→\s*(OUI|NON|PLUS TARD)', ligne)
                arbitrage.append({'texte': re.sub(r'\s*→.*$', '', a.group(1)).strip(), 'statut': statut.group(1) if statut else 'EN ATTENTE'})
            continue
        e = re.match(r'^\*\*\[(\d{2}/\d{2}/\d{4})\]\*\*\s*[—-]\s*(.+)$', ligne)
        if e:
            sections[courant].append({'date': e.group(1), 'texte': e.group(2)})
    return {'sections': sections, 'arbitrage': arbitrage}


def lire_evenements(depuis=0):
    """Événements de .opencrafts/activite.jsonl à partir de l'octet `depuis` ; renvoie (position, liste)."""
    chemin = interne('activite.jsonl')
    try:
        taille = os.path.getsize(chemin)
    except OSError:
        return 0, []
    if depuis > taille:            # fichier recréé : on repart du début
        depuis = 0
    with open(chemin, 'rb') as f:
        f.seek(depuis)
        brut = f.read()
    evenements = []
    for ligne in brut.decode('utf-8', 'replace').splitlines():
        try:
            evenements.append(json.loads(ligne))
        except ValueError:
            pass
    return taille, evenements


FICHIERS_ETAT = ['JOURNAL.md', 'MISSION.md', 'chantiers.json', 'comptabilite.json',
                 '.opencrafts/etat.json', '.opencrafts/harnais.json', '.opencrafts/produit.json',
                 '.opencrafts/harnais-produit.json']


def signature():
    """Change dès qu'un fichier lu par le dashboard change : la page ne relit l'état complet qu'alors."""
    h = hashlib.sha1()
    for nom in FICHIERS_ETAT:
        try:
            s = os.stat(os.path.join(dossier(), nom))
            h.update(f'{nom}:{s.st_mtime_ns}:{s.st_size};'.encode())
        except OSError:
            h.update(f'{nom}:-;'.encode())
    return h.hexdigest()[:16]


def etat_complet():
    position, evenements = lire_evenements(0)
    mission = [l for l in lire_texte('MISSION.md').splitlines() if l and not l.startswith('#')]
    return {
        'dossier': dossier(),
        'etat': lire_json(interne('etat.json'), {}),
        'harnais': lire_json(interne('harnais.json'), None),
        'mission': mission[0] if mission else '',
        'produit': lire_json(interne('produit.json'), None),
        'journal': lire_journal(),
        'compta': lire_json(os.path.join(dossier(), 'comptabilite.json'), {'devise': 'EUR', 'ecritures': []}),
        'chantiers': lire_json(os.path.join(dossier(), 'chantiers.json'), {'chantiers': []}),
        'harnais_produit': harnais_produit.lire(),
        'evenements': evenements[-40:],
        'position': position,
        'signature': signature(),
    }


# --- Écritures (tableau de pilotage, compta) -------------------------------------------------------------

_verrou = threading.Lock()
STATUT_ACTION = {'continuer': 'en-cours', 'debloquer': 'en-cours', 'pause': 'en-pause', 'terminer': 'termine', 'bloquer': 'bloque'}
LIBELLE_ACTION = {'continuer': 'Continuer', 'debloquer': 'Débloquer', 'pause': 'Mettre en pause', 'terminer': 'Terminé', 'bloquer': 'Bloquer'}


def ajouter_ligne(chemin, objet):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, 'a', encoding='utf-8') as f:
        f.write(json.dumps(objet, ensure_ascii=False) + '\n')


def noter_decision(entree, texte=None):
    ligne = {'date': aujourdhui(), 'heure': datetime.now().strftime('%H:%M'), **entree}
    ajouter_ligne(interne('decisions.jsonl'), ligne)
    ajouter_ligne(interne('activite.jsonl'), {
        't': time.time(), 'type': 'decision', 'agent': entree.get('agent') or 'orchestrateur',
        'texte': texte or f"vous avez décidé : {entree.get('reponse')} ({entree.get('chantier_nom') or entree.get('chantier') or 'arbitrage'})",
    })


def decider(d):
    if not isinstance(d, dict):
        return False
    with _verrou:
        if d.get('type') == 'arbitrage':
            if d.get('reponse') not in ('OUI', 'NON', 'PLUS TARD'):
                return False
            chemin = os.path.join(dossier(), 'JOURNAL.md')
            texte = lire_texte('JOURNAL.md')
            lignes = texte.split('\n')
            debut = str(d.get('texte') or '')[:40]
            for i, l in enumerate(lignes):
                if re.search(r'À ARBITRER\s*:', l) and not re.search(r'→\s*(OUI|NON|PLUS TARD)', l) and debut in l:
                    fin = '\r' if l.endswith('\r') else ''
                    lignes[i] = f"{l.rstrip()} → {d['reponse']} ({aujourdhui()}){fin}"
                    with open(chemin, 'w', encoding='utf-8', newline='') as f:
                        f.write('\n'.join(lignes))
                    noter_decision({'chantier': 'arbitrage', 'chantier_nom': "File d'arbitrage", 'question': d.get('texte'), 'reponse': d['reponse']})
                    return True
            return False

        chemin = os.path.join(dossier(), 'chantiers.json')
        donnees = lire_json(chemin, None)
        if not donnees or not isinstance(donnees.get('chantiers'), list):
            return False
        c = next((x for x in donnees['chantiers'] if x.get('id') == d.get('chantier')), None)
        if not c:
            return False
        if d.get('type') == 'decision':
            dec = next((x for x in c.get('decisions', []) if x.get('id') == d.get('decision')), None)
            if not dec or dec.get('statut') != 'en-attente':
                return False
            dec.update({'statut': 'tranchee', 'reponse': str(d.get('reponse'))[:200], 'le': aujourdhui()})
            if re.match(r'^(oui|débloquer|debloquer|continuer|go|valider)', dec['reponse'], re.I) and c.get('statut') in ('bloque', 'a-trancher', 'en-pause'):
                c['statut'] = 'en-cours'
            noter_decision({'chantier': c['id'], 'chantier_nom': c.get('nom'), 'agent': c.get('agent'), 'question': dec.get('question'), 'reponse': dec['reponse']})
        elif d.get('type') == 'chantier' and d.get('action') in STATUT_ACTION:
            c['statut'] = STATUT_ACTION[d['action']]
            noter_decision({'chantier': c['id'], 'chantier_nom': c.get('nom'), 'agent': c.get('agent'), 'action': d['action'], 'reponse': LIBELLE_ACTION[d['action']]})
        else:
            return False
        c['mis_a_jour'] = aujourdhui()
        ecrire_json(chemin, donnees)
        return True


def ecrire_compta(compta):
    if not isinstance(compta, dict) or not isinstance(compta.get('ecritures'), list):
        return False
    with _verrou:
        ecrire_json(os.path.join(dossier(), 'comptabilite.json'), compta)
        ajouter_ligne(interne('activite.jsonl'), {'t': time.time(), 'type': 'compta', 'agent': 'comptable', 'texte': 'comptes mis à jour dans le dashboard'})
    return True


def ecrire_harnais(d):
    """Nom du produit, contexte, précision : saisis dans le dashboard. Claude en est prévenu au message suivant."""
    if not isinstance(d, dict):
        return False
    with _verrou:
        _, quoi = harnais_produit.mettre_a_jour(d.get('nom'), d.get('contexte'), d.get('ajout'))
        if not quoi:
            return True
        noter_decision({'chantier': 'harnais', 'chantier_nom': 'Harnais du produit', 'agent': 'contexte',
                        'question': 'Harnais complété dans le dashboard (HARNAIS.md)', 'reponse': quoi},
                       texte=f'harnais du produit mis à jour : {quoi}')
    return True


def ouvrir_fichier(nom):
    cible = os.path.realpath(os.path.join(dossier(), nom or '.'))
    if not cible.startswith(os.path.realpath(dossier())) or not os.path.exists(cible):
        return False          # jamais en dehors du dossier de l'OpenCrafts
    try:
        if os.name == 'nt':
            os.startfile(cible)          # noqa: S606 -- fichier local du dossier, ouvert à la demande de l'utilisateur
            return True
    except OSError:
        pass
    return False


# --- Serveur HTTP ----------------------------------------------------------------------------------------

def page_html():
    with open(PAGE, encoding='utf-8') as f:
        html = f.read()
    return html.replace('<script>\n', '<script src="/pont.js"></script>\n<script>\n', 1)


class Gestion(BaseHTTPRequestHandler):
    server_version = 'OpenCrafts'

    def log_message(self, *args):          # silencieux : la console de Claude n'a pas besoin de ces lignes
        pass

    def _hote_ok(self):
        hote = (self.headers.get('Host') or '').rsplit(':', 1)[0].strip('[]')
        return hote in HOTES

    def _envoyer(self, code, corps, type_='application/json; charset=utf-8'):
        donnees = corps if isinstance(corps, bytes) else (json.dumps(corps, ensure_ascii=False) if not isinstance(corps, str) else corps).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', type_)
        self.send_header('Content-Length', str(len(donnees)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(donnees)

    def do_GET(self):
        if not self._hote_ok():
            return self._envoyer(403, {'erreur': 'hôte refusé'})
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path in ('/', '/index.html'):
            return self._envoyer(200, page_html(), 'text/html; charset=utf-8')
        if url.path == '/pont.js':
            with open(PONT, encoding='utf-8') as f:
                return self._envoyer(200, f.read(), 'text/javascript; charset=utf-8')
        if url.path == '/api/etat':
            sig = (q.get('signature') or [''])[0]
            if sig and sig == signature():
                return self._envoyer(200, {'inchange': True})
            return self._envoyer(200, etat_complet())
        if url.path == '/api/evenements':
            try:
                depuis = int((q.get('depuis') or ['0'])[0])
            except ValueError:
                depuis = 0
            position, evenements = lire_evenements(depuis)
            return self._envoyer(200, {'position': position, 'evenements': evenements})
        if url.path == '/api/ping':
            return self._envoyer(200, {'ok': True, 'dossier': dossier()})
        return self._envoyer(404, {'erreur': 'introuvable'})

    def do_POST(self):
        if not self._hote_ok() or self.headers.get('X-OpenCrafts') != '1':
            return self._envoyer(403, {'erreur': 'refusé'})
        try:
            longueur = min(int(self.headers.get('Content-Length') or 0), 2_000_000)
            corps = json.loads(self.rfile.read(longueur).decode('utf-8') or 'null')
        except (ValueError, UnicodeDecodeError):
            return self._envoyer(400, {'erreur': 'json'})
        chemin = urlparse(self.path).path
        if chemin == '/api/decider':
            return self._envoyer(200, {'ok': decider(corps)})
        if chemin == '/api/compta':
            return self._envoyer(200, {'ok': ecrire_compta(corps)})
        if chemin == '/api/harnais':
            return self._envoyer(200, {'ok': ecrire_harnais(corps)})
        if chemin == '/api/ouvrir':
            return self._envoyer(200, {'ok': ouvrir_fichier((corps or {}).get('nom'))})
        return self._envoyer(404, {'erreur': 'introuvable'})


def adresse_active():
    """Adresse du serveur de CE dossier s'il tourne (fichier .opencrafts/serveur.json + réponse au ping)."""
    info = lire_json(interne('serveur.json'), {})
    port = info.get('port')
    if not port:
        return None
    try:
        import urllib.request
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/ping', timeout=1) as r:
            reponse = json.loads(r.read().decode('utf-8'))
        if os.path.realpath(reponse.get('dossier', '')) == os.path.realpath(dossier()):
            return f'http://localhost:{port}/'
    except Exception:
        return None
    return None


class Serveur(ThreadingHTTPServer):
    # Sous Windows, SO_REUSEADDR laisserait deux serveurs partager le même port (le second ne recevrait
    # rien) : port exclusif, sinon on passe au suivant.
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if os.name == 'nt' and hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def lancer(port_voulu):
    for port in range(port_voulu, port_voulu + 20):
        try:
            serveur = Serveur(('127.0.0.1', port), Gestion)
            break
        except OSError:
            continue
    else:
        print('Aucun port libre entre', port_voulu, 'et', port_voulu + 19)
        sys.exit(1)
    os.makedirs(interne(), exist_ok=True)
    ecrire_json(interne('serveur.json'), {'port': port, 'pid': os.getpid(), 'depuis': datetime.now().isoformat(timespec='seconds')})
    print(f'Dashboard OpenCrafts : http://localhost:{port}/', flush=True)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            os.remove(interne('serveur.json'))
        except OSError:
            pass


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('action', nargs='?', default='lancer', choices=['lancer', 'etat'])
    p.add_argument('--port', type=int, default=int(os.environ.get('OPENCRAFTS_PORT', PORT_DEFAUT)))
    a = p.parse_args()
    if a.action == 'etat':
        print(adresse_active() or 'arrêté')
    else:
        lancer(a.port)

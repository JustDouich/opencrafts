"""Ouvre le dashboard OpenCrafts, sans rien à installer.

Par défaut (depuis la 0.5.0) : le dashboard est une page servie en local par `serveur.py` (Python seul),
que Claude Code affiche dans son panneau navigateur, à droite de la conversation, en direct. Ce script
démarre le serveur s'il ne tourne pas et donne son adresse.

Option : l'ancienne app de bureau (fenêtre Windows séparée), seulement si on la demande explicitement :
  - variable d'environnement OPENCRAFTS_APP (chemin d'un .exe), ou
  - .opencrafts/config.json, clé "app" : un chemin, ou une liste [executable, arguments...].
Elle n'est jamais téléchargée automatiquement.

Usage : python dashboard.py [ouvrir|etat|arreter]
"""
import os
import subprocess
import sys
import time

from commun import dossier, evenement, interne, lire_json

ICI = os.path.dirname(os.path.abspath(__file__))


def _detache():
    options = {'stdin': subprocess.DEVNULL, 'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL, 'close_fds': True}
    if os.name == 'nt':
        options['creationflags'] = 0x00000008 | 0x00000200   # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    else:
        options['start_new_session'] = True
    return options


def app_demandee():
    """Commande de l'app de bureau si l'utilisateur l'a choisie, sinon None."""
    cfg = lire_json(interne('config.json'), {})
    app = os.environ.get('OPENCRAFTS_APP') or cfg.get('app')
    if isinstance(app, list) and app:
        return app
    if isinstance(app, str) and os.path.exists(app):
        return [app]
    return None


def adresse():
    from serveur import adresse_active
    return adresse_active()


def demarrer_serveur():
    """Démarre serveur.py pour ce dossier s'il ne tourne pas ; renvoie son adresse (ou None)."""
    deja = adresse()
    if deja:
        return deja
    env = dict(os.environ, OPENCRAFTS_DOSSIER=dossier())
    subprocess.Popen([sys.executable, os.path.join(ICI, 'serveur.py')], cwd=dossier(), env=env, **_detache())
    for _ in range(30):                      # jusqu'à 3 secondes
        time.sleep(0.1)
        url = adresse()
        if url:
            evenement('dashboard', 'orchestrateur', 'Dashboard ouvert')
            return url
    return None


def ouvrir(silencieux=False):
    """Appelé par le hook à chaque demande (silencieux) et par Claude (« mon OpenCrafts »)."""
    app = app_demandee()
    if app:
        pid = lire_json(interne('dashboard.json'), {}).get('pid')
        if not pid:
            subprocess.Popen(app + ['--saw', '--dossier', dossier()], cwd=dossier(), **_detache())
            evenement('dashboard', 'orchestrateur', 'Dashboard ouvert')
        return "l'app de bureau"
    return demarrer_serveur()


def arreter():
    info = lire_json(interne('serveur.json'), {})
    pid = info.get('pid')
    if not pid:
        return False
    try:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True, timeout=5)
        else:
            os.kill(pid, 15)
    except Exception:
        return False
    try:
        os.remove(interne('serveur.json'))
    except OSError:
        pass
    return True


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'ouvrir'
    if action == 'etat':
        print(adresse() or 'arrêté')
    elif action == 'arreter':
        print('arrêté' if arreter() else 'il ne tournait pas')
    else:
        resultat = ouvrir()
        if resultat and resultat.startswith('http'):
            print(f'Dashboard : {resultat}')
            print("Affiche cette adresse dans ton panneau navigateur, à droite de la conversation (outil "
                  "preview_start avec cette url si tu l'as) ; sinon donne le lien à l'utilisateur.")
        elif resultat:
            print(f'Dashboard : {resultat}')
        else:
            print("Dashboard non ouvert : le serveur local n'a pas démarré. L'OpenCrafts fonctionne quand même ; "
                  "python .claude/skills/opencrafts/scripts/instantane.py produit une version à publier dans la conversation.")

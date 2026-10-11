"""Ouvre le dashboard OpenCrafts (app de bureau Electron) sur la droite de l'écran, branché sur ce dossier.

Où il cherche l'app, dans l'ordre :
  1. la variable d'environnement OPENCRAFTS_APP (chemin d'un .exe) ;
  2. .opencrafts/config.json, clé "app" : un chemin, ou une liste [executable, arguments...] ;
  3. %LOCALAPPDATA%\\OpenCrafts\\OpenCrafts.exe (installée par ce script au premier lancement) ;
  4. sinon il la télécharge depuis l'adresse "telechargement" de config.json (ou celle par défaut).

Usage : python dashboard.py [ouvrir|etat]
"""
import json
import os
import subprocess
import sys
import urllib.request

from commun import dossier, evenement, interne, lire_json

TELECHARGEMENT = 'https://github.com/JustDouich/opencrafts/releases/latest/download/OpenCrafts-Dashboard.exe'
LOCAL = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'OpenCrafts', 'OpenCrafts.exe')


def vivant():
    """Vrai si le dashboard de ce dossier tourne (fichier pid écrit par l'app)."""
    pid = lire_json(interne('dashboard.json'), {}).get('pid')
    if not pid:
        return False
    try:
        if os.name == 'nt':
            sortie = subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/NH'], capture_output=True, text=True, timeout=5).stdout
            return str(pid) in sortie
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def commande():
    cfg = lire_json(interne('config.json'), {})
    app = os.environ.get('OPENCRAFTS_APP') or cfg.get('app')
    if isinstance(app, list) and app:
        return app
    if isinstance(app, str) and os.path.exists(app):
        return [app]
    if os.path.exists(LOCAL):
        return [LOCAL]
    url = cfg.get('telechargement') or TELECHARGEMENT
    os.makedirs(os.path.dirname(LOCAL), exist_ok=True)
    tmp = LOCAL + '.part'
    urllib.request.urlretrieve(url, tmp)
    os.replace(tmp, LOCAL)
    return [LOCAL]


def ouvrir(silencieux=False):
    if vivant():
        return 'déjà ouvert'
    cmd = commande() + ['--saw', '--dossier', dossier()]
    options = {'stdin': subprocess.DEVNULL, 'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL, 'close_fds': True}
    if os.name == 'nt':
        options['creationflags'] = 0x00000008 | 0x00000200   # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    else:
        options['start_new_session'] = True
    subprocess.Popen(cmd, cwd=dossier(), **options)
    evenement('dashboard', 'orchestrateur', 'Dashboard ouvert')
    return 'ouvert'


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'ouvrir'
    if action == 'etat':
        print('ouvert' if vivant() else 'fermé')
    else:
        try:
            print('Dashboard :', ouvrir())
        except Exception as e:
            print(f"Dashboard non ouvert : {e}. L'OpenCrafts fonctionne quand même ; le dashboard se télécharge sur opencrafts.company.")

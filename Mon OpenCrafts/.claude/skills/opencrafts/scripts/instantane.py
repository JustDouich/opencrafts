"""Dashboard OpenCrafts en une seule page autonome, pour claude.ai et le téléphone (là où rien ne tourne en
direct) : la même page que dans Claude Code, avec l'état du moment intégré dedans.

Claude la publie dans la conversation (page / artefact). Elle s'anime (constellation, intérieur des agents)
mais montre l'état au moment de la publication ; un clic sur une décision prépare la phrase à envoyer à
Claude, qui l'applique avec chantiers.py ou arbitrer.py.

Usage : python instantane.py [sortie.html]      (par défaut : OpenCrafts-dashboard.html à la racine du dossier)
"""
import json
import os
import sys
import time

from commun import SKILL, dossier
from serveur import etat_complet

DASHBOARD = os.path.join(SKILL, 'assets', 'dashboard')


def construire():
    with open(os.path.join(DASHBOARD, 'index.html'), encoding='utf-8') as f:
        html = f.read()
    with open(os.path.join(DASHBOARD, 'pont.js'), encoding='utf-8') as f:
        pont = f.read()
    etat = etat_complet()
    etat['instantane'] = True
    etat['genere_le'] = int(time.time() * 1000)
    # « </ » fermerait la balise <script> si un texte du journal le contenait.
    donnees = json.dumps(etat, ensure_ascii=False).replace('</', '<\\/')
    injection = f'<script>window.__OPENCRAFTS_ETAT__ = {donnees};</script>\n<script>\n{pont}\n</script>\n<script>\n'
    return html.replace('<script>\n', injection, 1)


if __name__ == '__main__':
    sortie = sys.argv[1] if len(sys.argv) > 1 else os.path.join(dossier(), 'OpenCrafts-dashboard.html')
    with open(sortie, 'w', encoding='utf-8') as f:
        f.write(construire())
    print(f'Dashboard (instantané) : {sortie}')

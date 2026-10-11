"""Ajoute une entrée datée en haut de la section d'un agent dans JOURNAL.md (ajout seul, jamais de réécriture).

Usage : python journal.py <id_agent> "<ce qui a été fait>"
Agents : orchestrateur, contexte, rd, comptable, juridique, rh, pivot, distribution, marketing, innovation
"""
import os
import sys

from commun import NOMS, aujourd_hui, dossier, evenement


def ajouter(agent, texte):
    agent = agent if agent in NOMS else 'orchestrateur'
    chemin = os.path.join(dossier(), 'JOURNAL.md')
    lignes = open(chemin, encoding='utf-8').read().split('\n')
    titre = f'## Agent {NOMS[agent]}'
    entree = f'**[{aujourd_hui()}]** — {texte.strip()}'
    if titre in lignes:
        i = lignes.index(titre)
        lignes.insert(i + 1, entree)
    else:
        lignes += ['', titre, entree]
    with open(chemin, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lignes))
    evenement('journal', agent, texte)
    return entree


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    print(ajouter(sys.argv[1], ' '.join(sys.argv[2:])))

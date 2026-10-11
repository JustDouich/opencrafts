"""Installe (ou met à jour) l'OpenCrafts de ce dossier, sans poser de question, puis ouvre le dashboard.

Première installation : réglages par défaut (autonomie équilibrée, plafond 0 €, point du jour à 12:00).
Les harnais sont calculés par generer.py, sans IA. Les options servent APRÈS les questions sur le produit :

  python installer.py                                   # installation par défaut
  python installer.py --mission "..." --activite produit-physique [--autonomie prudent|equilibre|autonome]
                      [--budget 0] [--heure 12:00] [--reseaux instagram,linkedin] [--nom "Nom de l'entreprise"]
  Options : --sans-dashboard

Une mise à jour garde JOURNAL.md (on n'efface jamais l'historique) et y ajoute une entrée.
"""
import argparse
import json
import os
import re
import sys

from commun import NOMS, SKILL, aujourd_hui, dossier, ecrire_json, evenement, interne, lire_json
import generer

# Repère posé en tête de la constitution générée : sert au garde-fou ci-dessous.
MARQUE = '<!-- opencrafts-kit-claude-code -->'


def options():
    p = argparse.ArgumentParser()
    p.add_argument('--mission'); p.add_argument('--activite'); p.add_argument('--autonomie')
    p.add_argument('--budget', type=float); p.add_argument('--heure'); p.add_argument('--reseaux')
    p.add_argument('--nom'); p.add_argument('--sans-dashboard', action='store_true')
    p.add_argument('--forcer', action='store_true')
    return p.parse_args()


def main():
    o = options()
    racine = dossier()
    # Garde-fou : une OpenCrafts existante qui n'a pas été créée par ce kit (constitution écrite à la main,
    # agents déjà au travail) ne doit jamais être réécrite par mégarde. Créée par le kit = repère MARQUE en
    # tête d'OPENCRAFTS.md, ou date d'installation dans `.opencrafts/etat.json` (installations 0.4.0, avant le
    # repère). Un simple champ « version » ne suffit pas : d'autres outils l'écrivent.
    chemin_constitution = os.path.join(racine, 'OPENCRAFTS.md')
    if os.path.exists(chemin_constitution) and not o.forcer:
        with open(chemin_constitution, encoding='utf-8', errors='replace') as f:
            faite_par_le_kit = MARQUE in f.read(400)
        if not faite_par_le_kit and not lire_json(interne('etat.json'), {}).get('installe_le'):
            print("Arrêt : ce dossier contient déjà une OpenCrafts qui n'a pas été créée par ce kit. L'installer "
                  "réécrirait sa constitution (OPENCRAFTS.md) et ses harnais. Rien n'a été modifié.\n"
                  "Pour l'utiliser telle quelle avec le dashboard : il suffit d'ouvrir le dossier, le dashboard et les hooks "
                  "fonctionnent sans installation. Pour la réécrire quand même : --forcer (après une sauvegarde).")
            return
    etat = lire_json(interne('etat.json'), {})
    reponses = etat.get('reponses', {})
    if o.mission: reponses['mission'] = o.mission
    if o.activite: reponses['activite'] = o.activite
    if o.autonomie: reponses['autonomie'] = o.autonomie
    if o.budget is not None: reponses['budget'] = o.budget
    if o.heure: reponses['heure'] = o.heure
    if o.reseaux is not None:
        reponses.setdefault('presence', {})['reseaux'] = [r.strip() for r in o.reseaux.split(',') if r.strip()]
    reponses.setdefault('presence', {})['ia'] = 'claude'

    constitution = open(os.path.join(SKILL, 'assets', 'OPENCRAFTS.md'), encoding='utf-8').read()
    r = generer.generer(reponses, constitution, aujourd_hui())
    premiere = not os.path.exists(os.path.join(racine, 'JOURNAL.md'))
    for nom, texte in r['fichiers'].items():
        texte = texte.replace('Installation en cinq questions.', 'Installation sans question (réglages par défaut, à affiner après les questions sur le produit).')
        if nom == 'JOURNAL.md' and not premiere:
            continue                                          # jamais d'écrasement de l'historique
        if nom == 'OPENCRAFTS.md' and MARQUE not in texte[:400]:
            texte = f'{MARQUE}\n{texte}'
        if nom == 'BLOC-UNIVERSEL.md':
            nom = os.path.join('.opencrafts', nom)
        with open(os.path.join(racine, nom), 'w', encoding='utf-8', newline='\n') as f:
            f.write(texte)
    ecrire_json(interne('harnais.json'), r['harnais'])
    if not premiere:
        import journal
        journal.ajouter('orchestrateur', f"Harnais recalculés après les réponses sur le produit ({r['harnais'].get('autonomie', reponses.get('autonomie', 'equilibre'))}).")

    etat.update({'version': '3.0', 'reponses': reponses, 'mis_a_jour': aujourd_hui()})
    etat.setdefault('installe_le', aujourd_hui())
    if o.nom: etat['nom'] = o.nom
    ecrire_json(interne('etat.json'), etat)
    cfg = lire_json(interne('config.json'), None)
    if cfg is None:
        ecrire_json(interne('config.json'), {})
    if not os.path.exists(os.path.join(racine, 'chantiers.json')):
        ecrire_json(os.path.join(racine, 'chantiers.json'), {'format': 'opencrafts-chantiers-v1', 'chantiers': [
            {'id': 'demarrage', 'nom': 'Démarrer mon OpenCrafts', 'agent': 'orchestrateur', 'statut': 'en-cours', 'avancement': 30,
             'resume': 'Dix agents installés, harnais posés. Prochaine étape : comprendre le produit.',
             'reste': ["Donner le lien du produit ou de l'activité", "Choisir le niveau d'autonomie"], 'decisions': [], 'debut': aujourd_hui()}]})
    if not os.path.exists(os.path.join(racine, 'comptabilite.json')):
        ecrire_json(os.path.join(racine, 'comptabilite.json'), {'devise': 'EUR', 'ecritures': []})

    evenement('installation', 'orchestrateur', 'OpenCrafts installée' if premiere else 'OpenCrafts mise à jour')
    for cle in NOMS:
        evenement('agent-pret', cle, 'prêt')

    print(('Installée' if premiere else 'Mise à jour') + f' dans {racine}')
    print('\n'.join(r['resume']))
    if not o.sans_dashboard:
        import dashboard
        try:
            print('Dashboard :', dashboard.ouvrir())
        except Exception as e:
            print(f'Dashboard non ouvert : {e}')


if __name__ == '__main__':
    main()

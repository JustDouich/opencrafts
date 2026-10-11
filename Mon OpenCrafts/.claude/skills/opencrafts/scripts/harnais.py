"""Le harnais du produit : son nom, son contexte, et les précisions ajoutées au fil de l'usage.

C'est ce que tous les agents lisent avant d'agir. L'utilisateur le remplit dans le dashboard (bouton
HARNAIS, ou les deux questions à la première ouverture) ; Claude peut aussi l'enrichir avec ce script.

Données : .opencrafts/harnais-produit.json (source) ; HARNAIS.md (la même chose, lisible, régénérée).

Usage : python harnais.py voir
        python harnais.py maj [--nom "..."] [--contexte "..."] [--ajout "..."]
"""
import argparse
import os

from commun import aujourd_hui, dossier, ecrire_json, interne, lire_json

FICHIER = 'harnais-produit.json'


def lire():
    return lire_json(interne(FICHIER), {'nom': '', 'contexte': '', 'precisions': []})


def ecrire_markdown(h):
    lignes = [f"# Harnais de {h.get('nom') or 'votre produit'}", '',
              "Ce que tous les agents lisent avant d'agir. Modifiable dans le dashboard (bouton HARNAIS).", '',
              '## Produit', '', h.get('nom') or 'À préciser.', '',
              '## Contexte', '', h.get('contexte') or 'À préciser.', '']
    if h.get('precisions'):
        lignes += ['## Précisions', ''] + [f"- [{p.get('date', '')}] {p.get('texte', '')}" for p in h['precisions']] + ['']
    with open(os.path.join(dossier(), 'HARNAIS.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lignes))


def mettre_a_jour(nom=None, contexte=None, ajout=None):
    """Applique les champs donnés ; renvoie (harnais, résumé de ce qui a changé) ou (harnais, None) si rien."""
    h = lire()
    changes = []
    if nom is not None and nom.strip() and nom.strip() != h.get('nom'):
        h['nom'] = nom.strip()[:120]
        changes.append(f"nom : {h['nom']}")
    if contexte is not None and contexte.strip() != h.get('contexte', '') and contexte.strip():
        h['contexte'] = contexte.strip()[:6000]
        changes.append('contexte réécrit')
    if ajout is not None and ajout.strip():
        h.setdefault('precisions', []).append({'date': aujourd_hui(), 'texte': ajout.strip()[:1000]})
        changes.append(f'précision : {ajout.strip()[:80]}')
    if not changes:
        return h, None
    h['mis_a_jour'] = aujourd_hui()
    ecrire_json(interne(FICHIER), h)
    ecrire_markdown(h)
    etat = lire_json(interne('etat.json'), {})
    if h.get('nom') and etat.get('nom') != h['nom']:
        etat['nom'] = h['nom']
        ecrire_json(interne('etat.json'), etat)
    return h, ' ; '.join(changes)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['voir', 'maj'])
    p.add_argument('--nom'); p.add_argument('--contexte'); p.add_argument('--ajout')
    a = p.parse_args()
    if a.action == 'voir':
        h = lire()
        print(f"Produit : {h.get('nom') or 'à préciser'}\nContexte : {h.get('contexte') or 'à préciser'}")
        for x in h.get('precisions', [])[-10:]:
            print(f"- [{x.get('date')}] {x.get('texte')}")
    else:
        h, quoi = mettre_a_jour(a.nom, a.contexte, a.ajout)
        print(f'Harnais mis à jour ({quoi}).' if quoi else 'Rien à changer.')

"""File d'arbitrage de JOURNAL.md (OPENCRAFTS.md §5.7) : lire, ajouter une demande, enregistrer une décision.

La file est la section « ## File d'arbitrage » en tête de JOURNAL.md : une ligne par demande,
« [JJ/MM/AAAA] À ARBITRER : … », suivie de « → OUI / → NON / → PLUS TARD (date) » une fois tranchée.
Ce script n'exécute jamais l'action arbitrée : il ne fait qu'écrire la décision de l'humain.

  python arbitrer.py lister JOURNAL.md
  python arbitrer.py ajouter JOURNAL.md "Commercial — envoyer le mail à X, coût 0 €, gain un RDV" [--date JJ/MM/AAAA]
  python arbitrer.py decider JOURNAL.md 1 oui|non|plus-tard [--date JJ/MM/AAAA]

Le numéro de `decider` est celui affiché par `lister` (demandes EN ATTENTE seulement, dans l'ordre).
Le fichier est réécrit en place ; rien d'autre que la section de la file n'est modifié.
"""
import re
import sys
from datetime import date

ENTETE = re.compile(r"^##\s+File d['’]arbitrage\s*$", re.I)
LIGNE = re.compile(r"^(?:[-*]\s*)?(?:\[([^\]]+)\]\s*(?:—|-)?\s*)?À ARBITRER\s*:\s*(.+)$", re.I)
DECISION = re.compile(r"→\s*(OUI|NON|PLUS TARD)\b", re.I)
DECISIONS = {'oui': 'OUI', 'non': 'NON', 'plus-tard': 'PLUS TARD', 'plus tard': 'PLUS TARD'}


def bornes(lignes):
    debut = next((i for i, l in enumerate(lignes) if ENTETE.match(l.strip())), None)
    if debut is None:
        return None, None
    fin = next((i for i in range(debut + 1, len(lignes)) if re.match(r'^#{1,2}\s', lignes[i].strip())), len(lignes))
    return debut, fin


def demandes(lignes):
    debut, fin = bornes(lignes)
    if debut is None:
        return []
    sortie = []
    for i in range(debut + 1, fin):
        m = LIGNE.match(lignes[i].strip().replace('**', ''))
        if m:
            d = DECISION.search(m.group(2))
            sortie.append({'index': i, 'date': m.group(1), 'texte': m.group(2)[: d.start()].strip() if d else m.group(2).strip(),
                           'statut': d.group(1).upper() if d else 'EN ATTENTE'})
    return sortie


def lister(lignes):
    en_attente = [d for d in demandes(lignes) if d['statut'] == 'EN ATTENTE']
    tranchees = [d for d in demandes(lignes) if d['statut'] != 'EN ATTENTE']
    if not en_attente:
        print("Aucune demande en attente dans la file d'arbitrage.")
    for n, d in enumerate(en_attente, 1):
        print(f"{n}. [{d['date'] or 'sans date'}] {d['texte']}")
    if tranchees:
        print(f"\n({len(tranchees)} demande(s) déjà tranchée(s))")
    return en_attente


def ajouter(lignes, texte, jour):
    debut, _ = bornes(lignes)
    nouvelle = f'[{jour}] À ARBITRER : {texte.strip()}'
    if debut is None:
        i = next((k + 1 for k, l in enumerate(lignes) if l.startswith('# ')), 0)
        lignes[i:i] = ['', "## File d'arbitrage", '', nouvelle]
    else:
        i = debut + 2 if lignes[debut + 1:debut + 2] == [''] else debut + 1
        lignes.insert(i, nouvelle)
        # Garder une ligne vide avant la section suivante.
        if i + 1 < len(lignes) and lignes[i + 1].startswith('#'):
            lignes.insert(i + 1, '')
    return lignes


def decider(lignes, numero, choix, jour):
    en_attente = [d for d in demandes(lignes) if d['statut'] == 'EN ATTENTE']
    if not 1 <= numero <= len(en_attente):
        raise SystemExit(f'Numéro {numero} introuvable : {len(en_attente)} demande(s) en attente.')
    decision = DECISIONS.get(choix.lower())
    if not decision:
        raise SystemExit('Décision attendue : oui, non ou plus-tard.')
    i = en_attente[numero - 1]['index']
    lignes[i] = f'{lignes[i].rstrip()} → {decision} ({jour})'
    return lignes


if __name__ == '__main__':
    args = sys.argv[1:]
    jour = date.today().strftime('%d/%m/%Y')
    if '--date' in args:
        k = args.index('--date')
        jour = args[k + 1]
        del args[k:k + 2]
    if len(args) < 2:
        raise SystemExit(__doc__)
    action, chemin = args[0], args[1]
    texte = open(chemin, encoding='utf-8').read().replace('\r\n', '\n')
    lignes = texte.split('\n')
    if action == 'lister':
        lister(lignes)
    elif action in ('ajouter', 'decider'):
        lignes = ajouter(lignes, args[2], jour) if action == 'ajouter' else decider(lignes, int(args[2]), args[3], jour)
        open(chemin, 'w', encoding='utf-8', newline='\n').write('\n'.join(lignes))
        lister(lignes)
    else:
        raise SystemExit(__doc__)

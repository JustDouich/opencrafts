"""Comptabilité de l'OpenCrafts (agent Comptable) : recettes, dépenses, TVA, bilan. Fichier : comptabilite.json.

Le dashboard (app de bureau) lit et écrit le même fichier : ce que l'utilisateur saisit dans l'outil de
compta est visible ici, et inversement.

  python compta.py ajouter --type recette|depense --libelle "..." --montant 120 [--ttc] [--tva 20]
                           [--date JJ/MM/AAAA] [--categorie "..."] [--moyen "carte"]
  python compta.py lister [--mois MM/AAAA]
  python compta.py bilan [--annee AAAA]

Le Comptable enregistre et calcule. Il ne paie rien, ne déclare rien : il prépare.
"""
import argparse
import os
import sys
import uuid
from collections import defaultdict

from commun import aujourd_hui, dossier, ecrire_json, evenement, lire_json

FICHIER = lambda: os.path.join(dossier(), 'comptabilite.json')


def charger():
    return lire_json(FICHIER(), {'devise': 'EUR', 'ecritures': []})


def arrondi(x):
    return round(x + 1e-9, 2)


def ajouter(type_, libelle, montant, tva=20.0, ttc=False, date=None, categorie=None, moyen=None):
    if type_ not in ('recette', 'depense'):
        raise ValueError('type : recette ou depense')
    ht = montant / (1 + tva / 100) if ttc else montant
    e = {'id': uuid.uuid4().hex[:10], 'date': date or aujourd_hui(), 'type': type_, 'libelle': libelle,
         'categorie': categorie or ('Ventes' if type_ == 'recette' else 'Achats'), 'moyen': moyen or '',
         'ht': arrondi(ht), 'tva_taux': tva, 'tva': arrondi(ht * tva / 100), 'ttc': arrondi(ht * (1 + tva / 100)),
         'source': 'claude'}
    c = charger(); c['ecritures'].append(e); ecrire_json(FICHIER(), c)
    evenement('compta', 'comptable', f"{'recette' if type_ == 'recette' else 'dépense'} {e['ttc']} € : {libelle}")
    return e


def cle_mois(d):
    j, m, a = d.split('/')
    return f'{m}/{a}'


def bilan(ecritures):
    b = {'recettes_ht': 0, 'depenses_ht': 0, 'tva_collectee': 0, 'tva_deductible': 0}
    for e in ecritures:
        if e['type'] == 'recette':
            b['recettes_ht'] += e['ht']; b['tva_collectee'] += e['tva']
        else:
            b['depenses_ht'] += e['ht']; b['tva_deductible'] += e['tva']
    b = {k: arrondi(v) for k, v in b.items()}
    b['resultat_ht'] = arrondi(b['recettes_ht'] - b['depenses_ht'])
    b['tva_a_payer'] = arrondi(b['tva_collectee'] - b['tva_deductible'])
    return b


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['ajouter', 'lister', 'bilan'])
    p.add_argument('--type'); p.add_argument('--libelle'); p.add_argument('--montant', type=float)
    p.add_argument('--tva', type=float, default=20.0); p.add_argument('--ttc', action='store_true')
    p.add_argument('--date'); p.add_argument('--categorie'); p.add_argument('--moyen')
    p.add_argument('--mois'); p.add_argument('--annee')
    a = p.parse_args()
    if a.action == 'ajouter':
        e = ajouter(a.type, a.libelle or 'Sans libellé', a.montant or 0, a.tva, a.ttc, a.date, a.categorie, a.moyen)
        print(f"Enregistré : {e['date']} {e['type']} {e['libelle']} · {e['ht']} € HT · TVA {e['tva']} € · {e['ttc']} € TTC")
    else:
        ec = charger()['ecritures']
        if a.mois: ec = [e for e in ec if cle_mois(e['date']) == a.mois]
        if a.annee: ec = [e for e in ec if e['date'].endswith(a.annee)]
        if a.action == 'lister':
            for e in sorted(ec, key=lambda e: e['date'][6:] + e['date'][3:5] + e['date'][:2]):
                print(f"{e['date']}  {e['type']:<8} {e['libelle'][:40]:<40} {e['ttc']:>10.2f} € TTC  ({e['categorie']})")
            print(f'{len(ec)} écriture(s)')
        else:
            b = bilan(ec)
            par_mois = defaultdict(list)
            for e in ec: par_mois[cle_mois(e['date'])].append(e)
            print(f"Recettes HT {b['recettes_ht']} € · Dépenses HT {b['depenses_ht']} € · Résultat HT {b['resultat_ht']} €")
            print(f"TVA collectée {b['tva_collectee']} € · TVA déductible {b['tva_deductible']} € · TVA à payer {b['tva_a_payer']} €")
            for m in sorted(par_mois, key=lambda m: m[3:] + m[:2]):
                bm = bilan(par_mois[m]); print(f"  {m} : résultat {bm['resultat_ht']} € HT")

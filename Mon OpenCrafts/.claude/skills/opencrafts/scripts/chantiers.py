"""Tableau de pilotage : les chantiers de l'OpenCrafts et les décisions qu'ils attendent (chantiers.json).

Le dashboard affiche ce fichier en tableau, avec des boutons pour décider. Toute action qui attend
l'utilisateur DOIT y être inscrite : rien d'attendu ne reste caché dans la conversation.

  python chantiers.py ajouter <id> "<nom>" --agent <id_agent> [--statut en-cours] [--resume "..."] [--reste "a;b"]
  python chantiers.py maj <id> [--statut en-cours|bloque|en-pause|a-trancher|termine] [--avancement 40]
                          [--resume "..."] [--reste "a;b"]
  python chantiers.py attente <id> "<question>" [--options "Oui;Non;Plus tard"]
  python chantiers.py lister                      # tout le tableau, décisions en attente d'abord
  python chantiers.py decisions                   # décisions prises dans le dashboard, pas encore lues
"""
import argparse
import json
import os
import sys
import uuid

from commun import NOMS, aujourd_hui, dossier, ecrire_json, evenement, interne, lire_json

STATUTS = ['en-cours', 'bloque', 'en-pause', 'a-trancher', 'termine']
FICHIER = lambda: os.path.join(dossier(), 'chantiers.json')


def charger():
    d = lire_json(FICHIER(), None)
    if not isinstance(d, dict):
        d = {'format': 'opencrafts-chantiers-v1', 'chantiers': []}
    d.setdefault('chantiers', [])
    return d


def trouver(d, cid):
    return next((c for c in d['chantiers'] if c.get('id') == cid), None)


def ajouter(cid, nom, agent='orchestrateur', statut='en-cours', resume='', reste=None):
    d = charger()
    if trouver(d, cid):
        raise SystemExit(f'Le chantier {cid} existe déjà : utilisez « maj ».')
    d['chantiers'].append({'id': cid, 'nom': nom, 'agent': agent if agent in NOMS else 'orchestrateur', 'statut': statut,
                           'avancement': 0, 'resume': resume, 'reste': reste or [], 'decisions': [], 'debut': aujourd_hui()})
    ecrire_json(FICHIER(), d)
    evenement('chantier', agent, f'nouveau chantier : {nom}')


def maj(cid, **champs):
    d = charger(); c = trouver(d, cid)
    if not c:
        raise SystemExit(f'Chantier inconnu : {cid}')
    for k, v in champs.items():
        if v is not None:
            c[k] = v
    c['mis_a_jour'] = aujourd_hui()
    ecrire_json(FICHIER(), d)
    evenement('chantier', c.get('agent', 'orchestrateur'), f"{c['nom']} : {c.get('statut')}")


def attente(cid, question, options):
    d = charger(); c = trouver(d, cid)
    if not c:
        raise SystemExit(f'Chantier inconnu : {cid}')
    dec = {'id': uuid.uuid4().hex[:8], 'question': question, 'options': options, 'statut': 'en-attente', 'depuis': aujourd_hui()}
    c.setdefault('decisions', []).append(dec)
    ecrire_json(FICHIER(), d)
    evenement('attente', c.get('agent', 'orchestrateur'), f'attend votre décision : {question}')
    return dec


def lister():
    d = charger()
    attentes = [(c, x) for c in d['chantiers'] for x in c.get('decisions', []) if x.get('statut') == 'en-attente']
    print(f'{len(attentes)} décision(s) en attente')
    for c, x in attentes:
        print(f"  [{c['id']}] {x['question']}  ({' / '.join(x.get('options') or [])})")
    print()
    for c in d['chantiers']:
        print(f"{c['id']:<22} {c.get('statut', ''):<11} {str(c.get('avancement', 0)) + ' %':>6}  {c['nom']}")


def decisions_non_lues(marquer=True):
    """Décisions prises dans le dashboard depuis le dernier passage (lues par le hook de demande)."""
    chemin = interne('decisions.jsonl')
    try:
        lignes = [json.loads(l) for l in open(chemin, encoding='utf-8') if l.strip()]
    except OSError:
        return []
    etat = lire_json(interne('decisions-lues.json'), {'n': 0})
    nouvelles = lignes[etat.get('n', 0):]
    if marquer:
        ecrire_json(interne('decisions-lues.json'), {'n': len(lignes)})
    return nouvelles


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['ajouter', 'maj', 'attente', 'lister', 'decisions'])
    p.add_argument('id', nargs='?'); p.add_argument('texte', nargs='?')
    p.add_argument('--agent', default='orchestrateur'); p.add_argument('--statut', choices=STATUTS)
    p.add_argument('--avancement', type=int); p.add_argument('--resume'); p.add_argument('--reste')
    p.add_argument('--options', default='Oui;Non;Plus tard')
    a = p.parse_args()
    reste = [r.strip() for r in a.reste.split(';') if r.strip()] if a.reste is not None else None
    if a.action == 'ajouter':
        ajouter(a.id, a.texte or a.id, a.agent, a.statut or 'en-cours', a.resume or '', reste); print('Ajouté.')
    elif a.action == 'maj':
        maj(a.id, statut=a.statut, avancement=a.avancement, resume=a.resume, reste=reste); print('Mis à jour.')
    elif a.action == 'attente':
        dec = attente(a.id, a.texte, [o.strip() for o in a.options.split(';') if o.strip()])
        print(f"Décision ajoutée au tableau de pilotage ({dec['id']}). Elle est visible dans le dashboard.")
    elif a.action == 'lister':
        lister()
    else:
        for x in decisions_non_lues():
            print(f"{x.get('date', '')} · {x.get('chantier', '')} · {x.get('question') or x.get('action')} → {x.get('reponse')}")

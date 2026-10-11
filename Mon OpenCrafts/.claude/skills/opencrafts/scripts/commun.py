"""Outils partagés des scripts OpenCrafts pour Claude Code : chemins, agents, événements en direct."""
import json
import os
import sys
import time
from datetime import date, datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ICI = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(ICI)


def dossier():
    """Dossier de l'OpenCrafts : OPENCRAFTS_DOSSIER s'il est posé (un espace de travail Claude Code qui pilote
    une OpenCrafts rangée ailleurs), sinon celui du projet Claude Code (CLAUDE_PROJECT_DIR), sinon le dossier
    courant."""
    return os.path.abspath(os.environ.get('OPENCRAFTS_DOSSIER') or os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd())


def interne(*parties):
    d = os.path.join(dossier(), '.opencrafts')
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, *parties)


AGENTS = [
    ('orchestrateur', 'Orchestrateur'), ('contexte', 'Contexte / Mémoire'), ('rd', 'R&D / Lead Tech'),
    ('comptable', 'Comptable'), ('juridique', 'Juridique'), ('rh', 'RH / Compagnonnage'), ('pivot', 'Pivot'),
    ('distribution', 'Distribution / Commercial'), ('marketing', 'Marketing'), ('innovation', 'Innovation'),
]
NOMS = dict(AGENTS)

# Mots qui rattachent une demande ou une action à un agent (le premier qui correspond gagne).
MOTS = [
    ('comptable', ['compta', 'factur', 'tva', 'dépense', 'depense', 'recette', 'bilan', 'trésorerie', 'tresorerie', 'chiffre d\'affaires', 'marge', 'budget', 'comptabilite.json']),
    ('juridique', ['contrat', 'cgv', 'cgu', 'rgpd', 'mentions légales', 'juridique', 'statuts', 'propriété intellectuelle', 'dépôt de marque']),
    ('rh', ['recrut', 'embauch', 'freelance', 'salarié', 'compagnon', 'équipe', 'fiche de poste']),
    ('distribution', ['prospect', 'client', 'vente', 'vendre', 'revendeur', 'distribu', 'commercial', 'e-mail', 'mail', 'partenaire', 'boutique']),
    ('marketing', ['post', 'réseaux', 'reseaux', 'instagram', 'linkedin', 'tiktok', 'publicité', 'pub ', 'contenu', 'newsletter', 'logo', 'slogan', 'campagne', 'seo', 'visuel']),
    ('rd', ['code', 'site', 'appli', 'développ', 'develop', 'bug', 'script', 'api', 'prototype', 'technique', 'html']),
    ('pivot', ['pivot', 'changer de cap', 'repositionn', 'abandonner']),
    ('innovation', ['idée', 'idee', 'innov', 'tendance', 'veille', 'nouveau produit']),
    ('contexte', ['http', 'lien', 'marché', 'marche', 'concurren', 'analyse', 'produit', 'cible', 'persona', 'scrap', 'produit.json', 'PRODUIT.md']),
]


def agent_pour(texte, defaut='orchestrateur'):
    t = (texte or '').lower()
    for agent, mots in MOTS:
        if any(m.lower() in t for m in mots):
            return agent
    return defaut


def evenement(type_, agent, texte, **extra):
    """Ajoute un événement au fil en direct lu par le dashboard (.opencrafts/activite.jsonl)."""
    e = {'t': round(time.time(), 3), 'type': type_, 'agent': agent, 'texte': (texte or '')[:240]}
    e.update(extra)
    with open(interne('activite.jsonl'), 'a', encoding='utf-8') as f:
        f.write(json.dumps(e, ensure_ascii=False) + '\n')
    return e


def aujourd_hui():
    return date.today().strftime('%d/%m/%Y')


def lire_json(chemin, defaut):
    try:
        with open(chemin, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return defaut


def ecrire_json(chemin, valeur):
    tmp = chemin + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(valeur, f, ensure_ascii=False, indent=2)
    os.replace(tmp, chemin)


def maintenant():
    return datetime.now().strftime('%d/%m/%Y %H:%M')

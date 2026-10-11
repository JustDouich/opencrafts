"""Hook Claude Code : chaque demande et chaque action de Claude devient un événement en direct pour le dashboard.

Appelé par .claude/settings.json (UserPromptSubmit, PreToolUse, PostToolUse, Stop) avec le JSON du hook sur
l'entrée standard. N'écrit RIEN sur la sortie standard (elle serait ajoutée au contexte de Claude) et ne
fait jamais échouer le hook : en cas de problème, il se tait.

Usage manuel : python evenement.py agent <id_agent> "<ce que l'agent fait>"
"""
import json
import os
import sys

from commun import NOMS, agent_pour, evenement, interne, lire_json

LIBELLES = {
    'Read': 'lit', 'Write': 'écrit', 'Edit': 'modifie', 'MultiEdit': 'modifie', 'Glob': 'cherche',
    'Grep': 'cherche', 'WebFetch': 'lit une page web', 'WebSearch': 'cherche sur le web', 'Bash': 'lance',
    'TodoWrite': 'planifie', 'Task': 'délègue',
}


def resume_outil(nom, entree):
    entree = entree or {}
    if nom.startswith('mcp__'):                      # outils de connecteurs : « mcp__Navigateur__navigate » -> « navigate »
        nom = nom.rsplit('__', 1)[-1].replace('_', ' ')
    cible = entree.get('file_path') or entree.get('url') or entree.get('pattern') or entree.get('query') or entree.get('command') or ''
    cible = os.path.basename(cible) if entree.get('file_path') else cible
    return f"{LIBELLES.get(nom, nom)} {cible}".strip()[:200]


def agent_courant():
    return lire_json(interne('agent-courant.json'), {}).get('agent', 'orchestrateur')


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode == 'agent' and len(sys.argv) >= 3:
        agent = sys.argv[2] if sys.argv[2] in NOMS else 'orchestrateur'
        texte = ' '.join(sys.argv[3:])
        with open(interne('agent-courant.json'), 'w', encoding='utf-8') as f:
            json.dump({'agent': agent}, f)
        evenement('agent', agent, texte)
        print(f"{NOMS[agent]} : {texte}")
        return
    try:
        donnees = json.loads(sys.stdin.buffer.read().decode('utf-8', 'replace') or '{}')
    except ValueError:
        donnees = {}
    if mode == 'prompt':
        texte = donnees.get('prompt', '')
        agent = agent_pour(texte)
        with open(interne('agent-courant.json'), 'w', encoding='utf-8') as f:
            json.dump({'agent': agent}, f)
        evenement('demande', agent, texte)
        # Décisions prises dans le tableau de pilotage depuis le dernier message : la sortie standard de
        # ce hook est ajoutée au contexte de Claude, qui les applique sans qu'on ait à les recopier.
        try:
            from chantiers import decisions_non_lues
            nouvelles = decisions_non_lues()
            if nouvelles:
                print("Décisions prises par l'utilisateur dans le tableau de pilotage OpenCrafts depuis son dernier message "
                      "(ce sont ses décisions : applique-les, puis mets le chantier à jour avec chantiers.py) :")
                for x in nouvelles:
                    print(f"- {x.get('chantier_nom') or x.get('chantier')} : {x.get('question') or x.get('action')} → {x.get('reponse')} ({x.get('date')})")
        except Exception:
            pass
        if os.path.exists(interne('etat.json')):          # OpenCrafts installée : le dashboard doit être là
            try:
                import dashboard
                dashboard.ouvrir(silencieux=True)
            except Exception:
                pass
    elif mode in ('outil', 'fait'):
        nom = donnees.get('tool_name', '')
        entree = donnees.get('tool_input') or {}
        resume = resume_outil(nom, entree)
        agent = agent_pour(json.dumps(entree, ensure_ascii=False), defaut=agent_courant())
        evenement('outil' if mode == 'outil' else 'fait', agent, resume, outil=nom)
    elif mode == 'fin':
        evenement('fin', agent_courant(), 'a terminé')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        pass
    sys.exit(0)

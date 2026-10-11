# OpenCrafts

Une mini entreprise de dix agents autour de votre produit, qui travaille avec Claude Code, sur votre
ordinateur.

- **Installation en une phrase** : ouvrez le dossier `Mon OpenCrafts` dans Claude Code et écrivez
  « installe mon opencrafts ». Aucune question avant l'installation.
- **Un dashboard en direct** à droite de l'écran : chaque demande anime l'agent qui travaille.
- **Un tableau de pilotage** : tout ce qui attend votre décision y est affiché, avec des boutons
  (oui, non, plus tard, débloquer, continuer). Rien n'attend en silence dans la conversation.
- **À l'intérieur de chaque agent** : son rôle, son harnais, ce qu'il a fait. Le Comptable a un outil de
  compta complet (recettes, dépenses, TVA, export CSV).
- **Des garde-fous qu'aucun réglage ne lève** : aucun agent n'envoie, ne publie ni ne paie sans votre
  oui ; plafond de dépense à 0 € par défaut ; aucun mot de passe saisi par un agent.

## Démarrer

1. Téléchargez `Mon-OpenCrafts.zip` dans les [Releases](../../releases/latest) et décompressez-le.
2. Dans l'app Claude, onglet **Code**, ouvrez le dossier `Mon OpenCrafts`.
3. Écrivez **installe mon opencrafts**.

Le dashboard (`OpenCrafts-Dashboard.exe`, Windows) se télécharge tout seul au premier lancement depuis
les Releases de ce dépôt. Il n'est pas encore signé : Windows peut afficher un avertissement
(« Informations complémentaires », puis « Exécuter quand même »).

**Pré-requis** : l'app Claude avec Claude Code, Python 3, Windows pour le dashboard.

## Contenu du dépôt

| Dossier | Ce que c'est |
|---|---|
| `Mon OpenCrafts/` | Le dossier à ouvrir dans Claude Code : skill `opencrafts`, réglages (`.claude/settings.json`), hooks qui signalent l'activité au dashboard |
| `app/` | Le code du dashboard (Electron). Mode utilisé par le skill : `OpenCrafts.exe --saw --dossier <chemin>` |

## Ce que les réglages autorisent

`Mon OpenCrafts/.claude/settings.json` autorise d'avance **uniquement** les scripts du skill, la lecture et
l'écriture des fichiers du dossier, et la lecture de pages web. Les hooks écrivent l'activité dans
`.opencrafts/activite.jsonl`, que lit le dashboard. Rien n'est envoyé ailleurs.

## Licence

Tous droits réservés, pour l'instant. Contact : [opencrafts.company](https://opencrafts.company).

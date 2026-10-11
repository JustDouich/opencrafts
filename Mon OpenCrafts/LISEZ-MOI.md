# Mon OpenCrafts

Votre mini entreprise de dix agents, autour de votre produit. Elle vit dans ce dossier et travaille
avec Claude Code.

## Démarrer (2 minutes)

1. Ouvrez l'app Claude, onglet **Code**, et démarrez une session dans **ce dossier**.
2. Écrivez : **installe mon opencrafts**
3. C'est tout. Claude installe vos dix agents sans vous poser de question, ouvre le dashboard à droite
   de l'écran, puis vous demande le lien de votre produit.

## Ce qui se passe ensuite

- Chaque demande que vous faites à Claude anime votre OpenCrafts en direct : l'agent qui travaille
  s'allume dans le dashboard.
- Cliquez sur un agent pour entrer dedans : son rôle, son harnais, tout ce qu'il a fait.
- Le Comptable a un vrai outil de compta (recettes, dépenses, TVA, export CSV).
- Rien ne sort de votre entreprise (mail, post, paiement, contrat) sans votre oui.

## Ce que contient ce dossier

- `.claude/skills/opencrafts/` : le skill OpenCrafts (les instructions de Claude et ses scripts).
- `.claude/settings.json` : autorise d'avance **uniquement** les scripts du skill, la lecture et
  l'écriture des fichiers de ce dossier, et la lecture de pages web ; il signale chaque action de
  Claude au dashboard. Rien d'autre n'est autorisé d'avance.
- Après l'installation : `OPENCRAFTS.md` (constitution et harnais), `JOURNAL.md` (journal des agents),
  `MISSION.md`, `PRODUIT.md`, `comptabilite.json`.

## Pré-requis

- L'app Claude avec Claude Code (onglet Code).
- Python 3 sur l'ordinateur (pour les scripts du skill).
- Windows pour le dashboard (macOS et Linux : à venir). Il se télécharge tout seul au premier
  lancement.

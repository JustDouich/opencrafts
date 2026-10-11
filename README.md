# OpenCrafts

Une mini entreprise de dix agents autour de votre produit, qui travaille avec Claude.

**Rien à installer : le dashboard s'ouvre dans Claude.**

- **Installation en une phrase** : ouvrez le dossier `Mon OpenCrafts` dans Claude Code et écrivez
  « installe mon opencrafts ». Aucune question avant l'installation.
- **Le harnais de votre produit** : à la première ouverture, deux questions (le nom de votre produit,
  puis son contexte). Ensuite, le bouton **HARNAIS** reste toujours en vue pour l'enrichir au fil du temps.
  C'est ce que tous les agents lisent avant d'agir.
- **Un dashboard vivant** : les dix agents, ce qu'ils font, et vos **chantiers en cours** avec leurs
  boutons (débloquer, continuer, mettre en pause, terminé). Cliquez sur un agent pour entrer dans son
  cerveau : son rôle, son harnais, ce qu'il a fait. Le Comptable a un outil de compta complet.
- **Un tableau de pilotage** : tout ce qui attend votre décision, avec des boutons. Rien n'attend en
  silence dans la conversation.
- **Des garde-fous qu'aucun réglage ne lève** : aucun agent n'envoie, ne publie ni ne paie sans votre
  oui ; plafond de dépense à 0 € par défaut ; aucun mot de passe saisi par un agent.

## Deux façons de l'utiliser

| Où | Le dashboard |
|---|---|
| **Claude Code** (app Claude, onglet Code) | **En direct**, dans le panneau à droite de la conversation : chaque action anime l'agent qui travaille, vos clics reviennent à Claude. |
| **claude.ai et téléphone** | **Instantané** : le même dashboard, publié dans la conversation. Il montre l'état du moment et se met à jour à chaque « mon OpenCrafts ». |

## Démarrer

1. Téléchargez `Mon-OpenCrafts.zip` dans les [Releases](../../releases/latest) et décompressez-le.
2. Dans l'app Claude, onglet **Code**, ouvrez le dossier `Mon OpenCrafts`.
3. Écrivez **installe mon opencrafts**. Le dashboard s'ouvre à droite.

**Pré-requis** : l'app Claude avec Claude Code, et Python 3 sur l'ordinateur (Windows, macOS ou Linux).

## Contenu du dépôt

| Dossier | Ce que c'est |
|---|---|
| `Mon OpenCrafts/` | Le dossier à ouvrir dans Claude Code : skill `opencrafts`, dashboard (une page et un petit serveur Python local), réglages, hooks qui signalent l'activité |
| `app/` | Ancienne application de bureau, facultative. Elle n'est plus nécessaire depuis la 0.5.0. |

## Ce que les réglages autorisent

`Mon OpenCrafts/.claude/settings.json` autorise d'avance **uniquement** les scripts du skill, la lecture et
l'écriture des fichiers du dossier, et la lecture de pages web. Le dashboard est servi sur
`localhost` seulement : il ne répond qu'à votre ordinateur, et ne lit et n'écrit que dans le dossier.
Rien n'est envoyé ailleurs.

## Licence

Tous droits réservés, pour l'instant. Contact : [opencrafts.company](https://opencrafts.company).

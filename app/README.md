# OpenCrafts : le dashboard (Electron)

## Mode utilisé par le skill Claude Code

```
OpenCrafts.exe --saw --dossier "C:\chemin\vers\Mon OpenCrafts"
```

Ouvre le dashboard SAW sur la droite de l'écran, branché sur le dossier :

- lit `OPENCRAFTS.md`, `JOURNAL.md`, `MISSION.md`, `chantiers.json`, `comptabilite.json` et
  `.opencrafts/` (harnais, produit, activité) ;
- anime les agents en direct à partir de `.opencrafts/activite.jsonl` (écrit par les hooks du skill) ;
- tableau de pilotage : les décisions cliquées sont écrites dans `chantiers.json`, la file d'arbitrage de
  `JOURNAL.md` et `.opencrafts/decisions.jsonl`, que le hook transmet à Claude au message suivant ;
- outil de compta du Comptable : écrit `comptabilite.json`, partagé avec le script `compta.py`.

Une seule instance par machine : un second lancement ramène la fenêtre au premier plan (et change de
dossier si besoin). Le fichier `.opencrafts/dashboard.json` indique au skill que le dashboard tourne.

## Développement

```
npm install
npx electron . --saw --dossier "C:\chemin\vers\un\dossier\installé"
```

Construction de l'exécutable portable Windows :

```
npx electron-builder --win portable
```

Les autres modes de l'app (dashboard en ligne, fenêtres IA, vue 3D des chantiers) sont toujours
présents ; le mode `--saw` ne les modifie pas.

@echo off
REM OpenCrafts Desktop — lanceur en un clic (27/09/2026).
REM Objectif : permettre d'ouvrir l'app sans taper de commande dans un terminal
REM (ni Douich ni Claude via controle d'ecran, qui ne peut pas taper dans un
REM terminal). Installe les dependances la premiere fois seulement.
cd /d "%~dp0"
if not exist node_modules (
  echo Premiere installation des dependances, ca peut prendre une minute...
  call npm install
  if errorlevel 1 (
    echo Echec de "npm install". Verifiez que Node.js est bien installe.
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 (
  echo L'application s'est fermee avec une erreur. Voir le message ci-dessus.
  pause
)

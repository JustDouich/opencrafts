@echo off
REM Genere la paire de cles de licence OpenCrafts (une seule fois). Voir generer-cles.js.
cd /d "%~dp0"
node generer-cles.js
pause

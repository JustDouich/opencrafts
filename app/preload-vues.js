// OpenCrafts Desktop — preload des vues locales (vues/*.html), 02/10/2026.
// Expose une API minimale et en lecture seule à la page ; aucune écriture disque depuis la page.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opencrafts', {
  constitution: () => ipcRenderer.invoke('oc-constitution'),
  chantiers: () => ipcRenderer.invoke('oc-chantiers'),
  envoyerTheme: (theme) => ipcRenderer.invoke('oc-theme-saisi', theme),
});

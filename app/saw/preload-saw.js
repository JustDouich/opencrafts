// Pont minimal entre le dashboard SAW et le processus principal : lecture de l'état, écoute en direct,
// écriture de la compta. Rien d'autre n'est exposé à la page.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saw', {
  lire: () => ipcRenderer.invoke('saw:lire'),
  epingler: (oui) => ipcRenderer.invoke('saw:epingler', oui),
  ouvrir: (nom) => ipcRenderer.invoke('saw:ouvrir', nom),
  ecrireCompta: (compta) => ipcRenderer.invoke('saw:compta-ecrire', compta),
  decider: (decision) => ipcRenderer.invoke('saw:decider', decision),
  surEtat: (fn) => ipcRenderer.on('saw:etat', (e, etat) => fn(etat)),
  surEvenements: (fn) => ipcRenderer.on('saw:evenements', (e, ev) => fn(ev)),
});

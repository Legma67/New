// Querverbindungen zwischen Modulen (vermeidet zirkuläre Importe)
export const towerHooks = { onKill: null };
export const gameHooks = { onPathChanged: null, onPlotChanged: null, select: null, refreshBuild: null };

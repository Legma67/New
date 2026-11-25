# 🏰 Build Your Own Tower Defense

Ein 3D-Tower-Defense-Spiel für Browser, Smartphone und Tablet (Querformat). Du baust auf deinem eigenen Grundstück das Straßennetz selbst, stellst Türme auf und wehrst immer stärkere Gegnerwellen ab.

**Spielen:** `index.html` im Browser öffnen. Die Datei ist komplett eigenständig und braucht keinen Server und kein Internet. Über GitHub Pages läuft sie direkt.

## Features
- **Eigenes Grundstück:** Straßen malen (6 Wegtypen, Kurven und Kreuzungen verbinden sich automatisch), Deko platzieren, Türme bauen, drehen, verschieben und verkaufen. Grüne/rote Bauvorschau.
- **Echte Wegfindung (A\*):** Gegner laufen exakt über die gebaute Straße. Wenn eine Änderung den Weg zum Ziel unterbrechen würde, wird sie nicht übernommen.
- **30 Türme** mit eigenen Modellen und Fähigkeiten (Laser, Blitzketten, Minen, Drohnen, schwarzes Loch, Meteore, Drache …), je **5 Upgrade-Stufen**, die man am Modell sieht (Ringe, Stacheln, Krone, Aura).
- **43 Gegnertypen:** fliegend, unsichtbar, gepanzert, mit Schild, heilend, springend, sich teilend, mit Immunitäten …
- **Bosse alle 10 Wellen:** Steinriese, Feuerdrache, Eiskönig, Schattenmonster, Ultimativer Titan. Jeder hat Spezialfähigkeiten und eine eigene Lebensleiste.
- **5 Spielmodi:** Normal (30 Wellen), Endlos, Bossmodus, Schwer, Kreativ.
- **8 Biome:** Grasland, Wüste, Schnee, Vulkan, Dschungel, Dunkler Wald, Eiswelt, Magische Landschaft.
- **Fortschritt:** Spielerlevel, XP, Edelsteine, Kristalle, Shop (Türme, Skins, Effekte, Burgen, Biome, Boosts), Inventar mit Suche/Filter/Sortierung, Bestiarium, tägliche + feste Aufgaben, 36 Erfolge, Tagesbelohnung mit Serie.
- **Speichern:** automatisch im Browser (localStorage). Laufende Runden werden nach jeder Welle gesichert.
- **Sound:** alle Effekte und 5 Musikstücke werden live per WebAudio erzeugt. Musik und Effekte sind getrennt regelbar.
- **Steuerung:** Maus und Tastatur oder Touch (1 Finger: bauen/verschieben, 2 Finger: zoomen/drehen, Kamera-Knöpfe).
- **Teilen:** Grundstück als Code exportieren, fremde Grundstücke per Code besuchen oder übernehmen.

> Hinweis: Echter Online-Multiplayer bräuchte einen Server. Dieses Spiel läuft komplett lokal, deshalb funktionieren Teilen und Besuchen über Codes.

## Entwicklung
```
src/            Quellcode (data, audio, models, world, controls, save, game, ui, main)
vendor/         three.js r158 (MIT-Lizenz)
build.js        baut alles in eine einzige index.html
```
Nach Änderungen in `src/`: `node build.js`.

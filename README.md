# Build Your Own Tower Defense

Ein 3D-Tower-Defense-Spiel für den Browser (PC, Tablet, Handy). Du baust auf deinem eigenen Grundstück Straßen, Türme und Dekoration. Die Gegner laufen genau über die Wege, die du gebaut hast.

## Starten

Keine Installation nötig, nur ein lokaler Webserver (wegen ES-Modulen):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Oder per **GitHub Pages**: Settings → Pages → Branch auswählen → Ordner `/ (root)`.

## Features

- **Eigenes Grundstück** (22×22 Raster) mit Portal (Spawn) und Kristallkern (Ziel)
- **Bausystem**: Rasterbau, grüne/rote Vorschau, Drehen, Verschieben, Abriss, Bauanimation; Straßen per Ziehen
- **Straßensystem**: Kurven & Kreuzungen entstehen automatisch, 11 Straßenstile, Richtungspfeile
- **A\*-Wegfindung**: Gegner folgen der gebauten Strecke; Abriss, der den Weg zerstört, wird verhindert
- **30 Türme** mit eigenen Modellen & Angriffsarten (Geschosse, Laser, Kettenblitz, Flammenkegel, Minen, Meteoriten, Drohnen, Zeitfeld, Schwarzes Loch, Gold, Heilung, Verstärkung …)
- **5 Upgrade-Stufen** pro Turm, sichtbar am Modell; Upgrade/Verkaufen-Panel mit Zielmodus
- **45 Gegnertypen** mit Fähigkeiten (Rüstung, Schild, Fliegen, Unsichtbarkeit, Tarnung, Teilen, Wiederbeleben, Heilen, Springen …)
- **Unbegrenzte Wellen**, Mini-Bosse alle 5 und Bosse alle 10 Wellen (Steinriese, Feuerdrache, Eiskönig, Schattenmonster, Ultimativer Titan) mit Spezialfähigkeiten
- **5 Spielmodi**: Normal, Endlos, Bossmodus, Schwer, Kreativ
- **8 Biome**: Grasland, Wüste, Schnee, Vulkan, Dschungel, Dunkler Wald, Eiswelt, Magische Landschaft
- **Wirtschaft**: Münzen, Edelsteine, Erfahrung, Seltene Kristalle; Spielerlevel mit Belohnungen & Freischaltungen
- **Shop, Inventar** (Suche/Filter/Sortierung), **Turmübersicht**, **Gegner-Sammlung**, **Aufgaben**, **38 Erfolge**, **Statistiken**, **Tagesbelohnung**
- **Sound & Musik** komplett synthetisiert (Web Audio), Musik & Effekte getrennt regelbar
- **Speichern** automatisch im Browser (localStorage) + Export/Import-Code
- **Mobile Steuerung**: Touch, große Buttons, virtuelle Kamera-Buttons, angepasstes Layout

## Steuerung

| PC | Handy |
|---|---|
| Linke Maus: Kamera drehen / bauen | 1 Finger: Kamera drehen (Straßen-/Abrissmodus: ziehen zum Bauen) |
| Rechte Maus: verschieben, Mausrad: Zoom | 2 Finger: zoomen & verschieben |
| WASD bewegen, Q/E drehen, R Gebäude drehen | Tippen: platzieren / Turm auswählen |
| B Abriss, Leertaste Welle, F Tempo, U Upgrade, Entf Verkaufen, 1–9 Schnellwahl, Esc Abbrechen/Pause | Buttons ⟲ ⟳ ＋ － ⌂ für die Kamera |

## Technik

Three.js (im Ordner `vendor/` mitgeliefert, MIT-Lizenz), kein Build-Schritt. Code in `src/`:
`grid.js` (Raster & A*), `world.js` (Welt & Straßen), `build.js` (Bauen), `towers.js`, `enemies.js`, `combat.js` (Geschosse mit Pooling), `waves.js`, `game.js` (Grundstücke & Runden), `profile.js` (Speichern, Fortschritt), `ui.js`, `audio.js`, `effects.js`, `models.js` (prozedurale 3D-Modelle), `data/` (Türme, Gegner, Biome, Quests, Erfolge).

**Hinweis Multiplayer:** Echter Online-Multiplayer braucht einen eigenen Server und ist noch nicht enthalten. Das Spiel speichert lokal; die Nachbargrundstücke sind derzeit frei.

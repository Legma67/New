# 🏰 Build Your Own Tower Defense

Ein 3D-Tower-Defense-Spiel für Browser, Smartphone und Tablet (Querformat). Du baust auf deinem eigenen Grundstück das Straßennetz selbst, stellst Türme auf und wehrst immer stärkere Gegnerwellen ab.

**Spielen:** `index.html` im Browser öffnen. Die Datei ist komplett eigenständig und braucht keinen Server und kein Internet. Über GitHub Pages läuft sie direkt.

## So funktioniert das Spiel
- **Ein Endlos-Modus:** Jede Welle startest du selbst mit **▶ WELLE STARTEN** (automatischer Start ist in den Einstellungen abschaltbar und standardmäßig aus). Jede **5. Welle kommt ein Boss**. Nach dem Überspringen einer laufenden Welle musst du 4 Sekunden warten.
- **Pflicht-Tutorial beim ersten Start:** Du hast nur eine **Armbrust**. Die Wellen 1–4 sind so gebaut, dass sie allein reicht. In Welle 5 kommt der erste Boss, danach platzierst du deine neue Waffe.
- **Türme gibt es nur von Bossen**, nicht für Geld. Jeder Boss öffnet eine Truhe mit einer Waffe, oft gibt es Wegstücke, eine Falle oder Münzen als Bonus dazu.
- **Fusion statt Upgrades:** Drei gleiche Türme werden im Inventar per **FUSE** zu einem Turm **+1**, drei +1 zu einem +2 usw. bis **+9**. Die Stufe steht über dem Turm.
- **Münzen** von besiegten Gegnern brauchst du für **Wegstücke**. Mit Wegstücken baust du den Weg der Gegner um. Das geht nur in der Pause zwischen zwei Wellen, und es muss immer ein Weg zur Burg führen.
- **Fallen** (Stacheln, Kleber, Feuer, Sprengfalle, Frost) legst du direkt auf den Weg.
- **Verloren?** Du suchst dir neue Türme aus, und die nächste Runde beginnt wieder bei Welle 1. Alle Türme, die du bekommen hast, behältst du.
- **Spielfigur wie in Roblox:** Laufen mit WASD bzw. Joystick, Springen, Bonusmünzen einsammeln.
- **Immer Querformat:** Hältst du das Handy hochkant, dreht sich das Spiel automatisch mit.
- **Grafik:** Filmisches Licht (Tonemapping), Himmelskuppel mit Sonne, Spiegelungen auf Gold/Metall, wehende Grashalme, Wasser mit Schaumrand, Stimmungs-Partikel je Biom. Statische Objekte werden zusammengefasst, damit es auch auf dem Handy flüssig läuft.
- **Baumenü (Hotbar):** Kategorien links, große Karten mit Seltenheitsfarbe, +Stufe, Anzahl und Fuse-Hinweis; oben die Werte der Auswahl. Freie Felder leuchten beim Bauen.
- **Neue Türme:** Katapult, Schneemann, Balliste (durchbohrt mehrere Gegner), Säureturm (senkt Rüstung), Bienenstock, Ninja, Harpune (holt Flieger), Pilzturm und Lavaturm (Giftfelder/Lavafelder), Erdbebenturm, Gewitterwolke, Wirbelsturmturm, Spiegelturm (mehrere Strahlen), Kampf-Mech, Sonnenturm, Totempfahl (mehr Reichweite für Nachbarn), Phönixhorst und Kosmosturm.
- **Grafik:** Leuchteffekte an Türmen, Geschossen, Laternen und Portal, Mündungsfeuer, Schatten unter Fliegern, Lichtstimmung je Biom, Lebensbalken mit Rauch und Feuer an der Burg, rote Bildrand-Warnung im Bosskampf, Türme drehen sich im Leerlauf.
- Außerdem: 49 Türme mit Fusionsstufen +0 bis +9, 44 Gegnertypen, 8 Biome, Shop (Kosmetik, Wegstücke), Aufgaben, Erfolge, Bestiarium und automatisches Speichern.

> Hinweis: Echter Online-Multiplayer bräuchte einen Server. Dieses Spiel läuft komplett lokal, deshalb funktionieren Teilen und Besuchen über Codes.

## Entwicklung
```
src/            Quellcode (data, audio, models, world, controls, save, game, ui, main)
vendor/         three.js r158 (MIT-Lizenz)
build.js        baut alles in eine einzige index.html
```
Nach Änderungen in `src/`: `node build.js`.

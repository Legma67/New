# 🏰 Build Your Own Tower Defense

Ein 3D-Tower-Defense-Spiel für Browser, Smartphone und Tablet (Querformat). Du baust auf deinem eigenen Grundstück das Straßennetz selbst, stellst Türme auf und wehrst immer stärkere Gegnerwellen ab.

**Spielen:** `index.html` im Browser öffnen. Die Datei ist komplett eigenständig und braucht keinen Server und kein Internet. Über GitHub Pages läuft sie direkt.

## So funktioniert das Spiel
- **Ein Endlos-Modus:** Die Wellen kommen automatisch, und jede **5. Welle kommt ein Boss**.
- **Pflicht-Tutorial beim ersten Start:** Du hast nur eine **Armbrust**. Die Wellen 1–4 sind so gebaut, dass sie allein reicht. In Welle 5 kommt der erste Boss, danach platzierst du deine neue Waffe.
- **Türme gibt es nur von Bossen**, nicht für Geld. Jeder Boss öffnet eine Truhe mit einer Waffe, oft gibt es Wegstücke, eine Falle oder Münzen als Bonus dazu.
- **Münzen** von besiegten Gegnern brauchst du für **Upgrades** (5 Stufen) und **Wegstücke**. Mit Wegstücken baust du den Weg der Gegner um. Das geht nur in der Pause zwischen zwei Wellen, und es muss immer ein Weg zur Burg führen.
- **Fallen** (Stacheln, Kleber, Feuer, Sprengfalle, Frost) legst du direkt auf den Weg.
- **Verloren?** Du suchst dir neue Türme aus, und die nächste Runde beginnt wieder bei Welle 1. Alle Türme, die du bekommen hast, behältst du.
- **Spielfigur wie in Roblox:** Laufen mit WASD bzw. Joystick, Springen, Bonusmünzen einsammeln.
- **Immer Querformat:** Hältst du das Handy hochkant, dreht sich das Spiel automatisch mit.
- Außerdem: 31 Türme mit 5 Upgrade-Stufen, 44 Gegnertypen, 8 Biome, Shop (Kosmetik, Wegstücke), Aufgaben, Erfolge, Bestiarium und automatisches Speichern.

> Hinweis: Echter Online-Multiplayer bräuchte einen Server. Dieses Spiel läuft komplett lokal, deshalb funktionieren Teilen und Besuchen über Codes.

## Entwicklung
```
src/            Quellcode (data, audio, models, world, controls, save, game, ui, main)
vendor/         three.js r158 (MIT-Lizenz)
build.js        baut alles in eine einzige index.html
```
Nach Änderungen in `src/`: `node build.js`.

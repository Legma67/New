# Automatische Tests

Benötigt Python mit `playwright` und einen Chrome-Browser (Pfad über die Umgebungsvariable `CHROME`).

- `python3 tests/tut.py [mobile|portrait]`: spielt das komplette Pflicht-Tutorial durch
- `python3 tests/fuzz.py <seed> <runden> [pc|mobile|portrait]`: tausende Zufallsaktionen (bauen, abreißen, fusen, Wellen, Menüs, Bosse, Sterben …) und prüft nach jeder Aktion, ob Raster, Weg, Inventar, Münzen und Speicherstand noch stimmen
- `python3 tests/bot2.py`: ein Bot spielt drei Runden hintereinander (zum Ausbalancieren)

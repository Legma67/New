#!/bin/bash
# Lange Testreihe: max. 3 Browser gleichzeitig
cd /home/claude/tests
run3(){ "$@" & }
python3 fuzz.py 81 3000 pc > L_fz81.txt 2>&1 & python3 fuzz.py 82 3000 mobile > L_fz82.txt 2>&1 & python3 fuzz.py 83 2500 portrait > L_fz83.txt 2>&1 & wait
python3 fuzz.py 84 3000 mobile > L_fz84.txt 2>&1 & python3 fuzz.py 85 3000 pc > L_fz85.txt 2>&1 & python3 fuzz.py 86 2500 portrait > L_fz86.txt 2>&1 & wait
python3 tut.py pc > L_tpc.txt 2>&1 & python3 tut.py mobile > L_tmob.txt 2>&1 & python3 tut.py portrait > L_tpor.txt 2>&1 & wait
python3 bot2.py > L_bot.txt 2>&1 & python3 audit.py small > L_au_small.txt 2>&1 & python3 audit.py port > L_au_port.txt 2>&1 & wait
echo FERTIG > L_done.txt

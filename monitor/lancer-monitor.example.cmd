@echo off
rem Copie ce fichier en "lancer-monitor.cmd" et remplis les deux valeurs ci-dessous.
rem Le vrai fichier est ignoré par Git : ne mets jamais ton mot de passe dans cet exemple.
set PULSE_EMAIL=monitor@nexora.local
set PULSE_PASSWORD=CHANGE_MOI
rem set PULSE_URL=http://92.49.99.59:8097
rem set PULSE_INTERVAL_SECS=60
"%~dp0target\release\pulse-monitor.exe"
pause

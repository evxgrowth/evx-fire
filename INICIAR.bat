@echo off
title EVX Fire
cd /d "%~dp0"
echo.
echo   ====================================
echo      EVX FIRE - iniciando plataforma
echo   ====================================
echo.
if not exist node_modules (
  echo Instalando dependencias pela primeira vez, aguarde...
  call npm install
)
echo Abrindo http://localhost:3000 no navegador...
start "" http://localhost:3000
call npm run dev
pause

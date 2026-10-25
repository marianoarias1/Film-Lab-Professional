@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instala Node.js LTS desde https://nodejs.org y vuelve a ejecutar este archivo.
 pause
 exit /b 1
)
where cargo >nul 2>nul
if errorlevel 1 (
 echo Instala Rust con rustup desde https://rustup.rs y Visual Studio Build Tools con C++.
 echo Reabre esta consola al terminar. Ver README.md.
 pause
 exit /b 1
)
if not exist node_modules call npm ci
if errorlevel 1 goto :failed
call npm run setup
if errorlevel 1 goto :failed
call npm run build:engine
if errorlevel 1 goto :failed
call npm start
goto :eof
:failed
echo No se pudo iniciar. Revisa el error anterior.
pause

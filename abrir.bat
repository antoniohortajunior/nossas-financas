@echo off
cd /d "%~dp0"
echo Minhas Financas
echo Abra no celular e no PC: http://localhost:4173
echo Para o iPhone/Android na mesma rede, use o IP deste computador.
echo.
python -m http.server 4173

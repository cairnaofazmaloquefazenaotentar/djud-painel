@echo off
echo.
echo 🔄 REINICIANDO SERVIDOR DJUD...
echo.

REM Parar o servidor
taskkill /F /IM node.exe >/dev/null 2>&1

echo ✅ Servidor parado

REM Aguardar 3 segundos
timeout /t 3 /nobreak

REM Limpar cache
echo.
echo 🗑️  Limpando cache Next.js...
rmdir /s /q .next >/dev/null 2>&1

echo ✅ Cache removido

REM Regenerar Prisma
echo.
echo 🔧 Regenerando Prisma...
call npx prisma generate >/dev/null 2>&1

echo ✅ Prisma regenerado

REM Reiniciar servidor
echo.
echo 🚀 Iniciando servidor...
call npm run dev


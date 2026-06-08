TRAVIAN HELPER - REEMPLAZO DIRECTO DEL WORKER MVP
================================================

Este ZIP reemplaza solamente:
- src/lib/auto-apply.ts
- scripts/auto-apply-worker.ts

También agrega un script de uso único:
- scripts/reset-auto-apply-state.ts

La lógica Playwright que logró construir Embassy NO se modifica.

Desde la raíz del repo:

1. Detén el worker:
   pm2 stop travian-helper-worker

2. Crea respaldo de SQLite:
   cp dev.db "dev.db.bak-before-mvp-worker-$(date +%Y%m%d-%H%M%S)"

3. Extrae este ZIP sobre la raíz del repo:
   unzip -o travian-helper-mvp-worker-replacement.zip

4. Confirma que sí hubo cambios:
   git diff --stat
   git diff -- src/lib/auto-apply.ts scripts/auto-apply-worker.ts

5. Limpia locks y jobs viejos una sola vez:
   npx tsx scripts/reset-auto-apply-state.ts

6. Compila:
   npm run build

7. Reinicia app y worker:
   pm2 restart travian-helper --update-env
   pm2 restart travian-helper-worker --update-env
   pm2 save

8. Mira progreso:
   pm2 logs travian-helper-worker --lines 150 --nostream

Esperado en logs:
- initial account refresh started
- initial account refresh completed in ...
- processing one due job started
- processing one due job completed in ...
- post-action account refresh started
- post-action account refresh completed in ...

Cuando confirmes que funciona, puedes borrar el script de un uso:
   rm scripts/reset-auto-apply-state.ts

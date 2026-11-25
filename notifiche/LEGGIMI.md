# Notifiche Telegram (una volta sola)

1. **Bot**: su Telegram scrivi a @BotFather → /newbot → scegli nome e username. Copia il **token**.
2. **Canale**: crea un canale (anche privato), chiamalo es. "Pesca Venezia". Impostazioni canale → Amministratori → aggiungi il bot come amministratore (con permesso di pubblicare).
3. **ID del canale**: se il canale è pubblico usa `@nomecanale`. Se è privato: scrivi un messaggio nel canale, apri
   `https://api.telegram.org/bot<TOKEN>/getUpdates` e copia il valore `chat.id` (inizia con -100…).
4. **GitHub** → repository → Settings → Secrets and variables → Actions → New repository secret:
   - `TELEGRAM_TOKEN` = il token
   - `TELEGRAM_CHAT` = `@nomecanale` oppure l'id -100…
5. Tab **Actions** → "Notifica pesca" → Run workflow (con "test" attivo): ti arriva un messaggio di prova.

Poi parte da solo ogni giorno alle 06:30/07:30. Per condividere: manda il link d'invito del canale; chi lo apre riceve le notifiche senza creare nulla.

Soglie: modifica `notifiche/config.json` direttamente su GitHub (soglia_apnea, soglia_pesca, giorni_avanti, includi_oggi).
Orario: modifica la riga `cron` in `.github/workflows/notifica.yml` (è in UTC).

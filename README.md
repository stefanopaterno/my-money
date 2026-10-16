# My Money

PWA per entrate/uscite per periodo di stipendio (dal 27 al 26). Tutto in locale su IndexedDB: nessun backend, nessun login.
HTML + CSS + JavaScript vanilla (moduli ES), nessuna build.

## Struttura
```
index.html  manifest.json  sw.js  package.json
css/style.css
js/period.js   periodi (puro, testato)      js/calc.js     spese fisse, budget, riepilogo (puro, testato)
js/money.js    centesimi, formato it-IT     js/migrate.js  versione schema + migrazioni
js/db.js       wrapper IndexedDB            js/store.js    stato in memoria + persistenza
js/entry.js    inserimento rapido/carrello  js/forms.js    modifica movimenti/entrate
js/views/      dashboard, movimenti, fisse, impostazioni
tests/period.test.js
```

## Modello dati (IndexedDB `budget27` — nome interno mantenuto per non perdere i dati, schema v1)
- `movements` `{id, date, amount(cent), categoryId, note}`: il periodo si calcola dalla data, non è salvato.
- `incomes` `{id, date, amount, description}`: entrate extra.
- `categories` `{id, name, emoji, color, order, archived}`.
- `fixed` `{id, name, versions:[{from:'YYYY-MM', active, amount}]}`: disattivare, riattivare o cambiare importo
  da un periodo aggiunge una versione. Quelle precedenti non si toccano, quindi lo storico resta intatto.
- `periods` `{key:'YYYY-MM', salary?, budgets:{catId:cent}}`: stipendio e budget del periodo.
  Il budget è ereditato dal periodo precedente finché non lo modifichi.
- `paid` `{id:'fixedId|periodo'}`: spesa fissa pagata nel periodo.
- `meta`: impostazioni (`startDay`, stipendio standard, ultimo backup), `schemaVersion`, carrello in corso.

## Sviluppo e test
```
npm test          # test unitari (node --test, nessuna dipendenza)
npm run serve     # http://localhost:8080
```
Con il service worker attivo, in sviluppo i file restano in cache: dopo una modifica incrementa `VERSION` in `sw.js`
(oppure DevTools → Application → Unregister).

## Deploy (sito statico su HTTPS)
**GitHub Pages**: crea un repo, carica il contenuto di questa cartella, Settings → Pages → "Deploy from a branch" → `main` / root.
L'app sarà su `https://<utente>.github.io/<repo>/`. I percorsi sono relativi, quindi funziona anche in sottocartella.

**Hosting Aruba**: carica via FTP tutto il contenuto della cartella (esclusi `tests/`, `package.json`, `node_modules`) nella root del
dominio o in una sottocartella. Serve HTTPS attivo (necessario per service worker e IndexedDB persistente).

Ad ogni aggiornamento: incrementa `VERSION` in `sw.js`, altrimenti l'iPhone continua a usare la copia in cache.

## Installare su iPhone
1. Apri l'indirizzo con **Safari** (non Chrome).
2. Tocca Condividi → **Aggiungi a schermata Home** → Aggiungi.
3. Apri My Money dall'icona: parte a schermo intero e funziona offline.

## Backup (importante)
I dati vivono solo nel browser dell'iPhone. Se disinstalli l'app o cancelli i dati del sito, si perdono.
- Impostazioni → **Esporta tutti i dati**: si apre il foglio di condivisione; scegli "Salva su File" (iCloud Drive).
- Impostazioni → **Importa da file JSON**: chiede conferma e sostituisce tutto.
- Dopo 30 giorni dall'ultimo backup compare un promemoria nella dashboard.

## Home, Prospetto e voci extra
- **Home**: saluto, saldo, azioni rapide (Spesa, Entrata extra, Uscita extra, Prospetto) e parziali di oggi.
- **Prospetto → Periodo**: entrate (stipendio + extra), spese fisse, variabili per categoria, saldo; per il mese corrente anche incassato/da incassare, sostenuto/da sostenere e saldo previsto a fine periodo.
- **Prospetto → Cronologia**: grafico e lista dei periodi passati, corrente e dei 12 successivi (previsione = stipendio standard + spese fisse attive + budget).
- **Voce extra**: da Home, Prospetto o Movimenti, con "Salva e aggiungi un'altra" per inserirne più di una di fila.
- Ogni schermata secondaria ha la freccia **‹ Indietro** in alto a sinistra.

## Apertura, configurazione del mese e privacy
- All'apertura compare **"Cosa vuoi fare?"**: Registra un'entrata, Registra un'uscita, **Configura il mese** (stipendio, spese ripetute, voci extra). Riappare anche dopo più di 5 minuti in background. Si disattiva da Impostazioni → Privacy e apertura.
- **Spese ripetute**: dall'interruttore scegli "solo per questo mese" (dal mese dopo torna com'era) oppure "da questo mese in poi". Lo storico non cambia.
- **Privacy**: gli importi sono nascosti ("•••• €") finché non tocchi l'icona dell'occhio (aperto/barrato, come nelle app delle banche) in alto a destra. Si nascondono di nuovo quando l'app va in background, e l'anteprima nel selettore app è coperta. Mentre digiti un importo lo vedi sempre.
- Non è un blocco con PIN o Face ID: nasconde gli importi, ma chi ha l'iPhone sbloccato può toccare l'occhio.

## Carta di credito (ING / Fineco)
- In ogni uscita (inserimento rapido, uscita extra, modifica) c'è l'interruttore **Carta di credito** con la scelta della banca.
- L'importo pesa sul periodo in cui cade l'**addebito: il 10 del mese solare dopo l'acquisto**. Un acquisto del 16 ott conta nel periodo 27 ott – 26 nov; uno del 28 ott conta nello stesso periodo (addebito il 10 nov).
- Nel movimento resta la data dell'acquisto ("Carta ING · acquisto 16/10"). In Home e Prospetto la card **Carte di credito** mostra, per banca, cosa viene addebitato in questo periodo e cosa nel prossimo.
- Il giorno di addebito (10) e le banche sono costanti in `js/period.js` (`CARD_CHARGE_DAY`, `CARD_BANKS`).

## Uso rapido
Tocca **+** → digita l'importo (la categoria "Spesa cibo" è già selezionata) → **Salva**: 3 tap di navigazione, più le cifre.
Per la spesa: tab **Carrello**, digita un prezzo e **+ Aggiungi**, poi **Registra**: il totale diventa un solo movimento.
Il carrello viene salvato a ogni modifica, quindi chiudendo l'app non si perde nulla.
Dopo il salvataggio, "Annulla" resta disponibile per 6 secondi.

## Limiti noti
- **Feedback aptico**: Safari su iPhone non supporta `navigator.vibrate`. Uso il trucco dell'`<input switch>` (tick leggero) che funziona da iOS 18 in poi; sulle versioni precedenti resta solo il feedback visivo.
- **Giorno di inizio** limitato a 1–28 (così esiste in ogni mese). Cambiandolo, i movimenti vengono riassegnati ai periodi in base alla data.
- Cambiando l'importo di una spesa fissa "da un periodo", se esistono versioni successive restano quelle (si gestiscono dalla cronologia).
- Le spese fisse non si eliminano (si disattivano), per non perdere lo storico. Un nome sbagliato si corregge con "Rinomina".
- `navigator.storage.persist()` è richiesto all'avvio, ma Safari decide da solo: il backup resta la vera sicurezza.
- Il riordino delle categorie col drag è provato solo con eventi touch/pointer simulati, non su un iPhone fisico.
- I dati di esempio (Impostazioni → Avanzate) servono per provare l'app; rimuovili con "Cancella tutti i dati".

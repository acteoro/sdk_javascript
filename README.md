# @acteo/api: API verificare RCA, ITP, rovinietă și ARR pentru Node.js

[![npm](https://img.shields.io/npm/v/@acteo/api.svg)](https://www.npmjs.com/package/@acteo/api)
[![licență MIT](https://img.shields.io/npm/l/@acteo/api.svg)](./LICENSE)
[![tipuri TypeScript](https://img.shields.io/npm/types/@acteo/api.svg)](https://www.npmjs.com/package/@acteo/api)

SDK-ul oficial Node.js și TypeScript pentru [API-ul Acteo](https://acteo.ro/api-acces). Cu el verifici din cod dacă o mașină are RCA valabil, ITP la zi, rovinietă plătită sau copie conformă ARR, după numărul de înmatriculare sau seria de șasiu (VIN). Datele vin din sursele oficiale: baza AIDA pentru asigurarea RCA, RAR pentru inspecția tehnică periodică, CNAIR pentru rovinietă și ARR pentru transportul rutier.

Pe lângă verificările la cerere, SDK-ul decodează serii de șasiu, verifică la DGPCI dacă un număr de înmatriculare e liber, aduce poze de studio ale mașinilor, gestionează vehiculele monitorizate din cont și citește webhook-urile trimise când un document se apropie de expirare. Dacă ai o firmă de leasing, rent-a-car sau curierat, un service auto ori pur și simplu o flotă, afli din timp ce RCA, ITP sau rovinietă expiră, înainte să vină amenda.

> Ai nevoie de o cheie API. O generezi din [contul tău Acteo](https://app.acteo.ro/api/chei), după ce alegi un plan de pe [pagina API](https://acteo.ro/api-acces).

```ts
import { Acteo } from "@acteo/api"

const acteo = new Acteo({ apiKey: process.env.ACTEO_API_KEY })

const rca = await acteo.auto.rca.verifica("B123ABC")
console.log(rca.status, rca.expiresAt) // "valid" 2027-03-01T00:00:00.000Z
```

Apelurile sunt grupate pe domeniu și pe document, deci citești din cod ce verifici: `acteo.auto.rca`, `acteo.auto.itp`, `acteo.auto.rovinieta`, `acteo.auto.arr`, plus `acteo.auto.flota` pentru vehiculele din cont, `acteo.auto.vin`, `acteo.auto.numere` și `acteo.auto.imagini` pentru celelalte produse și `acteo.webhooks` pentru notificări.

## Cuprins

- [Ce face SDK-ul](#ce-face-sdk-ul)
- [Instalare](#instalare)
- [Pornire rapidă](#pornire-rapidă)
- [Ce identificator cere fiecare verificare](#ce-identificator-cere-fiecare-verificare)
- [Cum decurge o verificare](#cum-decurge-o-verificare)
- [Referință API](#referință-api)
- [Webhook-uri](#webhook-uri)
- [Erori](#erori)
- [Reîncercări, backoff și timeout](#reîncercări-backoff-și-timeout)
- [Cotă și limite](#cotă-și-limite)
- [Exemple](#exemple)
- [Vii de la @verificrca/sdk?](#vii-de-la-verificrcasdk)
- [Întrebări frecvente](#întrebări-frecvente)

## Ce face SDK-ul

| Funcție | Apel | Ce primești |
|---|---|---|
| Verificare RCA după număr sau VIN | `acteo.auto.rca.verifica()` | Starea poliței RCA și data expirării, din baza AIDA |
| Verificare ITP după VIN | `acteo.auto.itp.verifica()` | Data până la care e valabilă inspecția tehnică, din RAR |
| Verificare rovinietă | `acteo.auto.rovinieta.verifica()` | Dacă rovinieta e plătită și până când, din CNAIR |
| Verificare copie conformă ARR | `acteo.auto.arr.verifica()` | Valabilitatea copiei conforme pentru transportatori |
| Gestionare flotă | `acteo.auto.flota` | Adaugi, listezi și ștergi vehiculele monitorizate automat |
| Decodare VIN | `acteo.auto.vin.decodeaza()` | Marca, modelul, anul de fabricație și structura seriei de șasiu |
| Număr de înmatriculare disponibil | `acteo.auto.numere.verifica()` | Dacă numărul e liber la DGPCI și poate fi rezervat |
| Poza unei mașini | `acteo.auto.imagini.obtine()` | Link spre o poză de studio (WebP transparent) după marcă, model și an |
| Webhook-uri | `acteo.webhooks` | Rezultatul verificării la URL-ul tău, alerte `document.expira` la 30, 14 și 3 zile, plus evenimentele celorlalte servicii din cont |
| Validare locală | | Numărul de înmatriculare și VIN-ul sunt verificate înainte de cerere, deci o greșeală de tastare nu consumă din cotă |
| Erori tipate | | O clasă de eroare pentru fiecare situație, cu mesaj în română și `hint` de rezolvare |
| Reîncercări sigure | | Backoff exponențial cu jitter, `Retry-After` respectat, niciun POST taxat de două ori |

## Instalare

```bash
npm install @acteo/api
# sau
pnpm add @acteo/api
# sau
yarn add @acteo/api
```

Cheia API o poți da direct în constructor sau prin variabila de mediu `ACTEO_API_KEY`:

```bash
export ACTEO_API_KEY=cheia_ta_api
```

Nu pune cheia în cod care ajunge în browser. Cheia dă acces la cota contului tău și la vehiculele din el, deci o folosești doar pe server.

## Pornire rapidă

### Verificare RCA după număr de înmatriculare

```ts
import { Acteo } from "@acteo/api"

const acteo = new Acteo() // citește ACTEO_API_KEY

const rca = await acteo.auto.rca.verifica("B 123 ABC")

if (rca.status === "expired") {
	console.log("Mașina nu are RCA valabil.")
} else if (rca.status === "warning") {
	console.log(`RCA-ul expiră curând, pe ${rca.expiresAt?.toLocaleDateString("ro-RO")}`)
}
```

Un text de 17 caractere fără literele I, O și Q e tratat ca VIN, orice altceva ca număr de înmatriculare. Pentru RCA îți recomandăm să trimiți ambele. Baza AIDA găsește polița mai sigur după seria de șasiu, iar uneori o poliță emisă pe VIN nu apare la căutarea după număr:

```ts
await acteo.auto.rca.verifica({ numar: "B123ABC", vin: "WVWZZZ1JZXW000001" })
```

### Verificare ITP după serie de șasiu

```ts
const itp = await acteo.auto.itp.verifica("WVWZZZ1JZXW000001")
console.log(`ITP valabil până la ${itp.expiresAt?.toLocaleDateString("ro-RO")}`)
```

### Verificare rovinietă

Rovinieta cere trei date: numărul de înmatriculare, seria de șasiu (VIN) și numărul certificatului de înmatriculare (`serieTalon`), tipărit jos pe talon. Sursa oficială le validează pe toate trei împreună.

```ts
const rovinieta = await acteo.auto.rovinieta.verifica({
	numar: "B123ABC",
	vin: "WVWZZZ1JZXW000001",
	serieTalon: "I00639603F",
})
console.log(rovinieta.status, rovinieta.expiresAt)
```

Dacă sursa respinge datele (de exemplu, numărul talonului nu corespunde mașinii), primești `EroareVerificare` cu `codSursa: "serie_talon_invalida"`. O reîncercare cu aceleași date nu ajută; corectează întâi câmpul indicat:

```ts
import { EroareVerificare } from "@acteo/api"

try {
	await acteo.auto.rovinieta.verifica({ numar: "B123ABC", vin, serieTalon: talon })
} catch (err) {
	if (err instanceof EroareVerificare && err.codSursa === "serie_talon_invalida") {
		return cereUtilizatoruluiNumarulTalonului()
	}
	throw err
}
```

### Verificare copie conformă ARR

```ts
const arr = await acteo.auto.arr.verifica("CJ45XYZ")
```

### Decodare VIN

```ts
const d = await acteo.auto.vin.decodeaza("WVWZZZ1KZBW000000")
console.log(d.marca, d.model, d.anFabricatie) // "Volkswagen" "Golf" 2011
console.log(d.structura.wmi, d.structura.cifraControl) // "WVW" "neaplicabila"
```

Decodarea consumă din cotă doar când găsește marca și modelul (`taxat: true`). Fără ele primești totuși structura VIN-ului (WMI, VDS, VIS, țara, cifra de control, anii posibili), calculată din cele 17 caractere.

### Verifică dacă un număr de înmatriculare e liber

```ts
const r = await acteo.auto.numere.verifica("BV 07 ABC")
if (r.disponibil) console.log(`${r.numar} e liber`)
```

Răspunsul vine direct de la DGPCI, în aceeași cerere, și poate dura până la două minute. SDK-ul dă acestei cereri un timeout de cel puțin 150 de secunde, oricât de mic e `timeoutMs` din client. Consumă din cotă doar când DGPCI dă un verdict.

### Poza unei mașini

```ts
const p = await acteo.auto.imagini.obtine({ marca: "Volkswagen", model: "Golf", an: 2015, unghi: "fata" })
if (p.status === "gata") afiseaza(p.url) // link valabil până la p.expiraLa

// sau așteaptă cât timp poza e încă în lucru:
const gata = await acteo.auto.imagini.asteapta({ marca: "Volkswagen", model: "Golf", an: 2015 })
```

Cu `status: "gata"` primești poza mașinii cerute și cererea se taxează. Altfel primești poza generică (mașina sub husă), netaxată: `in-lucru` înseamnă că poza se generează acum, `necunoscut` că marca sau modelul nu au fost identificate, iar `indisponibil` că generarea a eșuat.

## Ce identificator cere fiecare verificare

Fiecare sursă oficială caută după alt identificator, așa că fiecare document își cere exact datele lui. SDK-ul aplică aceleași reguli ca API-ul și te oprește înainte de cerere dacă lipsește ceva.

| Apel | Ce primește | Sursa |
|---|---|---|
| `auto.rca.verifica(x)` | număr de înmatriculare **sau** VIN, ori `{ numar, vin }` (recomandat) | AIDA / BAAR |
| `auto.itp.verifica(vin)` | VIN (17 caractere) | RAR |
| `auto.rovinieta.verifica({ numar, vin, serieTalon })` | toate trei, **obligatorii** | CNAIR |
| `auto.arr.verifica(numar)` | număr de înmatriculare | ARR |

Formatele de număr acceptate: București (`B123ABC`, `B12ABC`), județe (`CJ45XYZ`, `IS08BCD`), corp diplomatic (`CD123A`) și numere temporare (`TC1234AB`). Spațiile și cratimele sunt eliminate automat, deci `b-123 abc` devine `B123ABC`. VIN-ul trebuie să aibă exact 17 caractere, fără literele I, O și Q (standardul ISO 3779).

`serieTalon` este numărul certificatului de înmatriculare, de forma `I00639603F`. SDK-ul păstrează doar literele și cifrele, cu majuscule, și cere între 6 și 20 de caractere, cu cel puțin o cifră. Doar sursa oficială poate confirma că numărul aparține mașinii.

## Cum decurge o verificare

1. **Cerere** (`porneste`). Fiecare cerere interoghează sursa oficială: verificarea intră în coadă și primești `status: "processing"`.
2. **Interogarea sursei.** Sursa oficială e consultată în fundal. Dacă nu răspunde în 4 minute, verificarea se încheie cu eroare.
3. **Rezultatul** ajunge la tine pe una din trei căi:
   - `verifica()` face tot drumul și întoarce direct rezultatul final;
   - `rezultat()` sau `asteapta()` fac polling, fără să consume din cotă;
   - webhook: dacă trimiți `callbackUrl` la `porneste()`, API-ul face POST cu rezultatul la adresa ta.

O verificare consumă din cota planului doar când sursa oficială a răspuns, inclusiv atunci când refuză datele trimise. Dacă sursa nu răspunde, nu consumi nimic. Interogările de rezultat sunt gratuite.

### Statusuri

| `status` | Înseamnă | `expiresAt` |
|---|---|---|
| `valid` | Document valabil | data expirării |
| `warning` | Expiră curând: RCA în 14 zile, ITP în 30, rovinietă în 7, ARR în 14 | data expirării |
| `expired` | Expirat sau inexistent, confirmat de sursă | data expirării sau `null` |
| `not_found` | Sursa nu a găsit vehiculul | `null` |
| `processing` | Verificarea e încă în curs | nu există |

Când verificarea se încheie cu eroare, SDK-ul aruncă `EroareVerificare`. Dacă sursa oficială doar nu a răspuns, `codSursa` lipsește și poți relua cererea. Dacă sursa a refuzat datele trimise, `codSursa` spune ce e greșit și reîncercarea nu ajută până nu corectezi câmpul:

| `codSursa` | Câmpul de corectat |
|---|---|
| `serie_talon_invalida` | `serieTalon`, numărul certificatului de înmatriculare |
| `vin_invalid` | `vin` |
| `numar_invalid` | numărul de înmatriculare |

## Referință API

### `new Acteo(optiuni?)`

| Opțiune | Tip | Implicit | Descriere |
|---|---|---|---|
| `apiKey` | `string` | `process.env.ACTEO_API_KEY` | Cheia API |
| `baseUrl` | `string` | `https://api.acteo.ro` | Adresa API-ului |
| `timeoutMs` | `number` | `30000` | Timeout pe fiecare cerere HTTP |
| `retry` | `object \| false` | `{ incercari: 3, intarziereInitialaMs: 500, intarziereMaximaMs: 10000 }` | Politica de reîncercare; `false` o oprește |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Alt `fetch` (proxy, agent HTTP, teste) |
| `userAgent` | `string` | | Adăugat la `User-Agent`, util în loguri |

Constructorul aruncă `EroareConfigurare` dacă lipsește cheia sau dacă o opțiune e invalidă.

Toate metodele primesc ca ultim argument `{ signal?: AbortSignal }`. Cu el poți anula cererea împreună cu reîncercările și așteptarea ei.

### `auto.<document>.verifica(identificator, optiuni?)`

Disponibil pe `auto.rca`, `auto.itp`, `auto.rovinieta` și `auto.arr`. Pornește verificarea și așteaptă rezultatul final. E calea cea mai simplă pentru scripturi și joburi cron. Opțiuni: `intervalMs` (implicit 3000, minim 2000) și `timeoutMs` (implicit 5 minute). La depășire aruncă `EroareTimeoutVerificare`. Rezultatul are tipul documentului: `auto.rca.verifica()` întoarce un rezultat cu `tip: "rca"`.

### `auto.<document>.porneste(identificator, { callbackUrl? })`

Pornește verificarea fără să aștepte. Întoarce un obiect `VerificareInCurs` pe care îl dai mai departe la `rezultat()` sau `asteapta()`.

```ts
const r = await acteo.auto.itp.porneste("WVWZZZ1JZXW000001", {
	callbackUrl: "https://example.com/webhooks/acteo/9f3k2", // opțional
})

if (r.status === "processing") {
	console.log("În coadă, requestId:", r.requestId)
	const final = await acteo.auto.itp.asteapta(r)
}
```

### `auto.<document>.rezultat(referinta)`

Interoghează o singură dată. Nu consumă din cotă. Primește obiectul întors de `porneste()` sau direct identificatorul documentului, de exemplu `acteo.auto.rca.rezultat("B123ABC")`.

### `auto.<document>.asteapta(referinta, optiuni?)`

Face polling până la rezultatul final, cu aceleași opțiuni ca `verifica()`. Nu consumă din cotă.

### `auto.flota.lista()`

Toate vehiculele din cont, cu datele de expirare `rcaExpiraLa`, `itpExpiraLa`, `rovinietaExpiraLa` și `arrExpiraLa` (ca `Date` sau `null`). Câmpul `activ` e `true` cât timp vehiculul e verificat automat și primește notificări de expirare. `serieTalon` e numărul certificatului de înmatriculare (sau `null`), iar `serieTalonRespinsa` devine `true` când sursa oficială l-a respins; rovinieta nu se mai verifică până nu e corectat. Vehiculele din cont sunt verificate automat și periodic, deci lista îți dă o imagine la zi a flotei fără să consume din cota de verificări.

### `auto.flota.adauga({ numarInmatriculare?, serieSasiu?, serieTalon?, arrMonitorizat? })`

Adaugă un vehicul în monitorizare. Trimite cel puțin un identificator. ITP-ul se monitorizează doar cu VIN, iar rovinieta cere numărul, VIN-ul și `serieTalon`; fără numărul talonului, rovinieta nu se verifică.

```ts
const v = await acteo.auto.flota.adauga({
	numarInmatriculare: "B123ABC",
	serieSasiu: "WVWZZZ1JZXW000001",
	serieTalon: "I00639603F",
})
```

Poți primi `EroareInterzis` cu `cod: "LIMIT_ATINS"` când ai atins numărul de mașini din plan, sau `EroareConflict` când vehiculul există deja.

### `auto.flota.sterge(id)`

Scoate vehiculul din cont. Aruncă `EroareNegasit` dacă ID-ul nu există în contul cheii.

Operațiile pe flotă nu consumă din cota de verificări, dar cer un plan activ.

### `auto.vin.decodeaza(vin)`

Decodează o serie de șasiu. Întoarce `marca`, `model`, `anFabricatie`, `sursaAn` (`"pozitia-10"`, `"generatie"` sau `"anunturi"`), `modelePosibile` și `structura` (`wmi`, `vds`, `vis`, `regiune`, `tara`, `cifraControl`, `cifraControlAsteptata`, `aniPosibili`). `gasit` spune dacă marca e cunoscută, iar `taxat` dacă cererea s-a consumat din cotă. VIN-ul e validat local înainte de cerere. Cere un abonament de decodare VIN.

### `auto.numere.verifica(numar)`

Verifică la DGPCI un singur număr complet: indicativul județului, cifrele și trei litere (`BV07ABC`, `B123ABC`). Numerele incomplete sau cu `?` și `*` sunt respinse local. Întoarce `numar` (normalizat), `disponibil` și `mesaj` (textul DGPCI, sau `null`). Dacă DGPCI nu acceptă numărul primești `EroareValidare` cu `cod: "NUMAR_RESPINS"`. Când verificarea nu poate rula primești `EroareServer` cu `cod` `OCUPAT`, `INDISPONIBIL`, `EROARE_DGPCI` sau `TIMEOUT`. Niciuna nu se taxează, iar `OCUPAT` se reîncearcă singur după `Retry-After`. Cere un abonament de numere disponibile.

### `auto.imagini.obtine({ marca, model, an, unghi?, umbra? })`

Răspunde imediat cu poza mașinii sau cu poza generică. `unghi` poate fi `"trei-sferturi"` (implicit), `"fata"`, `"profil"`, `"spate"`, `"trei-sferturi-dreapta"` sau `"profil-dreapta"`, iar `umbra` e implicit `true`. Câmpuri: `gata`, `status`, `taxat`, `url`, `expiraLa` (`Date`), `latime`, `inaltime`, `marca` și `model` (forma canonică) și `generatie` (`eticheta`, `anDe`, `anPana`, `caroserie`, sau `null`). La `in-lucru`, `retryAfterMs` spune când să ceri din nou. Linkul expiră după 24 de ore. Fiecare cerere a unei poze gata se taxează, deci păstrează linkul până la `expiraLa`. Cere un abonament de imagini mașini.

### `auto.imagini.asteapta({ marca, model, an, unghi?, umbra? }, { timeoutMs? })`

Ca `obtine()`, dar cât timp poza e `in-lucru` o cere din nou, cu pauzele din `Retry-After` (cel puțin 10 secunde). Întoarce primul răspuns care nu mai e `in-lucru`. După `timeoutMs` (implicit 2 minute) aruncă `EroareTimeoutVerificare`. Cererile intermediare nu se taxează, dar intră în plafonul zilnic de poze generice.

### Utilitare de validare

```ts
import {
	esteNumarInmatriculareValid,
	esteSerieTalonValida,
	esteVinValid,
	normalizeaza,
	normalizeazaSerieTalon,
} from "@acteo/api"

esteNumarInmatriculareValid("CJ 45 XYZ") // true
esteVinValid("WVWZZZ1JZXW00000I")        // false: litera I nu e permisă în VIN
esteSerieTalonValida("I00639603F")       // true
normalizeaza(" b-123 abc ")              // "B123ABC"
normalizeazaSerieTalon("i 00639603-f")   // "I00639603F"
```

Le poți folosi pentru formularele tale, ca să validezi datele înainte să ajungă la server.

### Constante exportate

| Constantă | Valoare |
|---|---|
| `TIPURI_VERIFICARE` | `["rca", "itp", "rovinieta", "arr"]`, util pentru dropdown-uri și validare |
| `UNGHIURI_IMAGINE` | unghiurile acceptate de `auto.imagini` |
| `HEADER_CHEIE_WEBHOOK` | `"x-acteo-key"`, headerul cu cheia de webhook |
| `HEADER_EVENIMENT_WEBHOOK` | `"x-acteo-event"`, headerul cu numele evenimentului |
| `URL_IMPLICIT` | `"https://api.acteo.ro"` |
| `VERSIUNE_SDK` | versiunea pachetului, trimisă în `User-Agent` |

### Documentația completă a tipurilor

Fiecare metodă, câmp și clasă de eroare are documentație JSDoc, cu parametri, valoare întoarsă, erorile posibile și un exemplu. O vezi direct în editor, la hover. Ca s-o generezi ca site HTML, rulează `pnpm docs` în repo; rezultatul ajunge în `docs/`.

## Webhook-uri

API-ul trimite două feluri de webhook. SDK-ul le validează cu scheme stricte și îți dă obiecte tipate, cu datele ca `Date`.

### Rezultatul unei verificări (`callbackUrl`)

Când trimiți `callbackUrl` la `porneste()`, primești un POST cu rezultatul imediat ce e gata. Dacă sursa nu răspunde, primești `status: "error"`.

```ts
app.post("/webhooks/acteo/9f3k2", express.raw({ type: "application/json" }), (req, res) => {
	const r = acteo.webhooks.parseazaRezultat(req.body) // string, Buffer sau obiect
	if (r.status !== "error") salveaza(r.requestId, r.result?.expiresAt)
	res.sendStatus(200)
})
```

Pune un segment greu de ghicit în URL, păstrează-l pe HTTPS și verifică dacă `requestId`-ul primit corespunde celui întors de `porneste()` înainte să te bazezi pe conținut.

### Notificări din cont (`document.expira` și celelalte evenimente)

Pe planurile care includ webhook-uri, configurezi un URL în dashboard și primești câte un eveniment când un document al unui vehicul monitorizat intră într-un prag de expirare. Pentru RCA, ITP și rovinietă pragurile sunt 30, 14 și 3 zile, iar pentru ARR 60, 50 și 45 de zile. Fiecare cerere vine cu cheia contului în headerul `X-Acteo-Key` și cu numele evenimentului în `X-Acteo-Event`. SDK-ul o compară în timp constant, ca să nu dezvăluie nimic prin durata comparației:

```ts
import { EroareWebhook } from "@acteo/api"

app.post("/webhooks/acteo", express.raw({ type: "application/json" }), (req, res) => {
	try {
		const ev = acteo.webhooks.verificaNotificare(req.body, req.headers, { cheie: process.env.ACTEO_WEBHOOK_KEY! })
		if (ev.event === "document.expira") {
			trimiteAlerta(`${ev.vehicul.numarInmatriculare}: ${ev.document} expiră în ${ev.zileRamase} zile`)
		}
		res.sendStatus(200)
	} catch (err) {
		res.sendStatus(err instanceof EroareWebhook ? 401 : 500)
	}
})
```

Folosește `ev.id` pentru deduplicare. Un eveniment poate ajunge de mai multe ori dacă serverul tău nu răspunde cu 2xx. Butonul de test din dashboard trimite `event: "webhook.test"`.

Cu add-on-ul Webhook, la același URL vin și evenimentele celorlalte servicii din cont. `verificaNotificare()` le validează pe toate și le distingi după `event`:

| `event` | Când vine | Câmpuri principale |
|---|---|---|
| `document.expira` | Un document al unui vehicul intră într-un prag de expirare | `vehicul`, `document`, `expiraLa`, `zileRamase`, `prag` |
| `dosar.eveniment` | Noutate într-un dosar monitorizat | `dosar`, `eveniment.tip`, `eveniment.descriere` |
| `dosar.termen` | Se apropie o ședință, cu 3 zile și cu o zi înainte | `dosar`, `sedinta`, `zileRamase` |
| `firma.schimbare` | ANAF a schimbat starea unei firme monitorizate | `firma`, `schimbari` |
| `firma.dosar` | Dosar nou în instanță pe numele unei firme | `firma`, `dosar.insolventa` |
| `marca.schimbare` | Schimbare la o marcă urmărită (OSIM sau EUIPO) | `marca`, `schimbare`, `valoareVeche`, `valoareNoua` |
| `marca.expira` | O marcă intră într-un prag de expirare | `marca`, `expiraLa`, `prag`, `reinnoirePanaLa` |
| `asigurare.schimbare` | S-a schimbat statutul de asigurat la CNAS | `persoana`, `statut`, `areCard` |
| `termen.expira` | Un termen din cont intră în pragul de 30 sau de 3 zile | `termen`, `zileRamase`, `prag` |
| `webhook.test` | Butonul de test din dashboard | `mesaj` |

Datele cu oră (`trimisLa`, `sedinta.data`, `verificatLa`) devin `Date`. Datele calendaristice `yyyy-mm-dd` (`marca.expiraLa`, `termen.expiraLa`) rămân text.

## Erori

Toate erorile moștenesc `ActeoError`, care la rândul ei moștenește `Error`. Fiecare are `_tag`, `message` (în română), plus `status`, `cod`, `hint` și `raspuns` când vin de la API.

| Clasă | Când apare | Câmpuri utile |
|---|---|---|
| `EroareConfigurare` | Cheie lipsă sau opțiuni invalide | |
| `EroareValidare` | Date greșite, local sau HTTP 400; 422 când DGPCI refuză numărul (`NUMAR_RESPINS`) | `camp`, `acceptate`, `cod` |
| `EroareAutentificare` | 401: cheie invalidă sau dezactivată | `hint` |
| `EroarePlanInactiv` | 402: fără abonament activ | `hint` |
| `EroareInterzis` | 403: `LIMIT_ATINS`, `ARR_NECESITA_PLAN` | `cod`, `limita` |
| `EroareNegasit` | 404: vehicul inexistent în cont | |
| `EroareConflict` | 409: `VEHICUL_EXISTENT` | |
| `EroareLimita` | 429: cotă, plafon de flotă sau polling prea des | `cod`, `retryAfterMs`, `utilizareZi`, `utilizareLuna` |
| `EroareServer` | 5xx; la numere disponibile `OCUPAT`, `INDISPONIBIL`, `EROARE_DGPCI`, `TIMEOUT` | `status`, `cod`, `retryAfterMs` |
| `EroareRetea` | Fără răspuns sau timeout | `timeout`, `neajunsa` |
| `EroareRaspunsInvalid` | Răspuns cu formă neașteptată | `raspuns` |
| `EroareVerificare` | Sursa oficială nu a putut fi interogată sau a refuzat datele | `codSursa` |
| `EroareTimeoutVerificare` | `asteapta()` sau `imagini.asteapta()` a depășit `timeoutMs` | |
| `EroareWebhook` | Cheie greșită sau payload invalid | `cod` |

```ts
import { ActeoError, EroareLimita, EroareValidare } from "@acteo/api"

try {
	await acteo.auto.rca.porneste(numar)
} catch (err) {
	if (err instanceof EroareValidare) return arataUtilizatorului(err.message)
	if (err instanceof EroareLimita && err.cod === "COTA_ATINSA") return amanaPanaMaine()
	if (err instanceof ActeoError) logger.error(err._tag, err.message, err.hint)
	throw err
}
```

## Reîncercări, backoff și timeout

Erorile trecătoare sunt reîncercate automat, cu backoff exponențial (x2) și jitter, plafonat la `intarziereMaximaMs`. Când serverul trimite `Retry-After`, pauza nu coboară sub valoarea cerută.

SDK-ul nu trimite niciodată de două ori o verificare taxată.

| Situație | GET / DELETE | POST |
|---|---|---|
| Rețea căzută, timeout | se reîncearcă | nu (cererea poate să fi ajuns) |
| DNS, conexiune refuzată | se reîncearcă | se reîncearcă (sigur nu a ajuns) |
| 502, 503, 504 fără `cod` | se reîncearcă | se reîncearcă (proxy, nu aplicația) |
| 503 `OCUPAT` la numere disponibile | | se reîncearcă după `Retry-After` (netaxat) |
| 502, 503, 504 cu alt `cod` | | nu (netaxat, dar repetarea nu ajută imediat) |
| 500 | se reîncearcă | nu |
| 429 la polling | se reîncearcă după `Retry-After` | |
| 429 cotă sau plafon flotă | nu | nu |
| 4xx | nu | nu |

```ts
const acteo = new Acteo({
	timeoutMs: 15_000,
	retry: { incercari: 5, intarziereInitialaMs: 250, intarziereMaximaMs: 8_000 },
})
```

## Cotă și limite

Fiecare verificare consumă o unitate din cota zilnică și lunară a planului, dar numai când sursa oficială a răspuns. Decodarea VIN, numerele disponibile și pozele au fiecare abonamentul și cota lor: decodarea se taxează doar cu marcă și model găsite, numărul doar când DGPCI dă un verdict, iar poza doar când e gata. Decodările fără rezultat și pozele generice au un plafon zilnic separat. Dacă sursa nu răspunde, nu consumi nimic. Verificările încă în curs ocupă cota până la răspuns, ca să nu treci de limită cu cereri trimise în paralel.

Rezultatele (inclusiv decodările, numerele și pozele) au câmpul `limite`, completat din headerele `X-RateLimit-*`:

```ts
const r = await acteo.auto.rca.porneste("B123ABC")
console.log(r.limite) // { zi: { limita: 300, ramase: 287 }, luna: { limita: 10000, ramase: 9412 } }
```

Cota zilnică se resetează la miezul nopții, ora României. Limitele fiecărui plan le găsești pe [pagina API](https://acteo.ro/api-acces).

## Exemple

Folderul [`examples/`](./examples) conține scripturi gata de rulat:

- [`verificare-rca.ts`](./examples/verificare-rca.ts): verificare RCA cu număr și VIN, tratarea erorilor;
- [`flota.ts`](./examples/flota.ts): raport cu RCA, ITP, rovinietă și ARR care expiră în 30 de zile, pentru toată flota;
- [`webhook-server.ts`](./examples/webhook-server.ts): server `node:http` care primește ambele tipuri de webhook.

### Verificare în masă

```ts
const numere = ["B123ABC", "CJ45XYZ", "IS08BCD"]

const rezultate = await Promise.allSettled(
	numere.map((numar) => acteo.auto.rca.verifica(numar)),
)
```

Pentru liste mari, adaugă vehiculele în cont cu `auto.flota.adauga()`. Sunt monitorizate automat și primești notificările de expirare, fără să consumi din cota de verificări.

## Vii de la @verificrca/sdk?

Pachetul `@verificrca/sdk` s-a mutat la `@acteo/api`. Instalezi pachetul nou și schimbi apelurile:

| Înainte | Acum |
|---|---|
| `new VerificRca()` | `new Acteo()` |
| `VERIFICRCA_API_KEY` | `ACTEO_API_KEY` (cea veche e citită în continuare, dacă lipsește cea nouă) |
| `verificari.verificaSiAsteapta({ tip: "rca", query })` | `auto.rca.verifica(query)` |
| `verificari.verificaSiAsteapta({ tip: "itp", query: vin })` | `auto.itp.verifica(vin)` |
| `verificari.verificaSiAsteapta({ tip: "rovinieta", query, serieSasiu, serieTalon })` | `auto.rovinieta.verifica({ numar, vin, serieTalon })` |
| `verificari.porneste(...)` / `rezultat(...)` / `asteapta(...)` | `auto.<document>.porneste` / `rezultat` / `asteapta` |
| `vehicule.lista()` / `adauga()` / `sterge()` | `auto.flota.lista()` / `adauga()` / `sterge()` |
| `parseazaWebhookRezultat()` / `verificaWebhookNotificare()` | `webhooks.parseazaRezultat()` / `webhooks.verificaNotificare()` |
| `VerificRcaError` | `ActeoError` |

Erorile, tipurile rezultatelor și utilitarele de validare au rămas aceleași.

## Întrebări frecvente

### Cum verific RCA-ul unei mașini din Node.js?

Instalezi `@acteo/api`, creezi un client cu cheia API și apelezi `acteo.auto.rca.verifica("B123ABC")`. Primești statusul poliței și data expirării, din baza de date AIDA.

### Pot verifica ITP-ul după numărul de înmatriculare?

Nu. RAR caută inspecția tehnică periodică doar după seria de șasiu (VIN), așa că SDK-ul respinge cererea înainte să plece, fără să consume din cotă. VIN-ul îl găsești în talon, la rubrica E.

### Unde găsesc numărul certificatului de înmatriculare?

Pe talon (certificatul de înmatriculare), jos, la rubrica „Numărul certificatului”. Conține litere și cifre, de exemplu `I00639603F`. Nu îl confunda cu seria de șasiu (VIN), care e la rubrica E și are 17 caractere. SDK-ul acceptă numărul și cu spații sau cu litere mici și îl aduce singur la forma corectă.

### De ce verificarea rovinietei cere numărul talonului?

Pentru că așa cere sursa oficială: interogarea rovinietei validează împreună numărul de înmatriculare, VIN-ul și numărul certificatului de înmatriculare. Fără el, cererea e respinsă înainte să plece, fără să consume din cotă. Pentru vehiculele din cont, adaugă `serieTalon` la `auto.flota.adauga()`, altfel rovinieta lor nu se monitorizează.

### De unde vin datele?

Din sursele oficiale: AIDA (baza de date a asigurărilor RCA administrată de BAAR), Registrul Auto Român pentru ITP, CNAIR pentru rovinietă și Autoritatea Rutieră Română pentru copia conformă. Nu estimăm nimic: fiecare rezultat e exact ce a răspuns sursa.

### De ce o poliță RCA nouă apare ca expirată?

Asigurătorul are nevoie de timp ca să înregistreze polița nouă în AIDA, de obicei între 1 și 7 zile. În acest interval verificarea poate arăta polița veche. Detalii despre [amenzile pentru RCA expirat](https://acteo.ro/amenzi/rca).

### Merge în browser?

Tehnic da, dar nu trebuie să-l folosești acolo, pentru că ar expune cheia API. Folosește-l pe server (Node.js, Next.js route handlers, funcții serverless) și trimite spre browser doar rezultatul.

### Cum verific dacă un număr de înmatriculare e liber?

Apelezi `acteo.auto.numere.verifica("BV07ABC")`. SDK-ul trimite numărul la DGPCI și îți întoarce `disponibil: true` dacă e liber și poate fi rezervat. Trimite numărul complet, cu județ, cifre și trei litere; căutările cu `?` sau `*` nu sunt acceptate.

### Ce aflu dintr-o serie de șasiu (VIN)?

Cu `acteo.auto.vin.decodeaza(vin)` afli marca, modelul și anul de fabricație, plus structura VIN-ului: producătorul (WMI), țara, cifra de control și anii posibili. Câmpul `sursaAn` spune de unde vine anul, iar `modelePosibile` apare când datele nu indică un singur model.

### Există SDK pentru PHP sau Python?

Da, cu aceleași apeluri: [`acteo/api`](https://github.com/acteoro/sdk_php) pentru PHP și [`acteo`](https://github.com/acteoro/sdk_python) pentru Python. [Documentația API](https://acteo.ro/api-acces) are și exemple pentru cURL.

## Linkuri utile

- [Documentația API Acteo](https://acteo.ro/api-acces)
- [Verificare RCA online](https://acteo.ro/verificare-rca)
- [Verificare ITP online](https://acteo.ro/verificare-itp)
- [Verificare rovinietă online](https://acteo.ro/verificare-rovinieta)
- [Verificare copie conformă ARR](https://acteo.ro/verificare-arr)
- [Monitorizare flote auto](https://acteo.ro/flote)
- [Changelog](./CHANGELOG.md)

## Dezvoltare

```bash
pnpm install
pnpm test        # teste unitare, fără rețea
pnpm test:e2e    # teste pe API-ul real
```

Testele e2e citesc configurarea din `.env.e2e`, fișier ignorat de git. Pornești de la șablon:

```bash
cp .env.e2e.example .env.e2e
```

Fără cheie rulează doar testul de autentificare. Cu `ACTEO_API_KEY` se adaugă listarea vehiculelor, care e gratuită. Verificările reale (`ACTEO_E2E_VERIFICARI=1`) consumă din cotă, iar testul de flotă (`ACTEO_E2E_FLOTA=1`) adaugă și șterge un vehicul. Amândouă pornesc doar dacă le activezi explicit.

## Licență

[MIT](./LICENSE), © Acteo.ro

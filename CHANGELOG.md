# Changelog

## @acteo/api 0.1.0 (2026-10-28)

Pachetul `@verificrca/sdk` continuă sub numele `@acteo/api`, cu apelurile grupate pe domeniu și pe document. Vezi secțiunea „Vii de la @verificrca/sdk?” din README.

- Client nou `Acteo`: `acteo.auto.rca`, `acteo.auto.itp`, `acteo.auto.rovinieta` și `acteo.auto.arr`, fiecare cu `verifica`, `porneste`, `rezultat` și `asteapta`. Fiecare document își cere exact identificatorii lui, iar rezultatul are tipul documentului.
- La RCA, un text de 17 caractere fără I, O și Q e tratat ca VIN. Cu ambele date: `{ numar, vin }`.
- `acteo.auto.flota` pentru vehiculele din cont și `acteo.webhooks` pentru webhook-uri.
- Adresa implicită este `https://api.acteo.ro`. Cheia se citește din `ACTEO_API_KEY`, apoi din `VERIFICRCA_API_KEY`.
- `ActeoError`, clasa de bază a erorilor (aceeași cu `VerificRcaError`).
- Clientul `VerificRca` și apelurile de până acum funcționează în continuare, cu aceeași adresă implicită.

## 0.2.0 (2026-10-09)

Verificarea rovinietei cere acum numărul certificatului de înmatriculare. Este o cerință nouă a sursei oficiale, care validează împreună numărul de înmatriculare, VIN-ul și numărul talonului. Codul care verifică rovinieta fără `serieTalon` trebuie actualizat: cererea e respinsă local cu `EroareValidare` (`camp: "serieTalon"`), fără să consume din cotă.

- `verificari.porneste` și `verificaSiAsteapta` primesc `serieTalon` (ex: `I00639603F`), obligatoriu la `tip: "rovinieta"`. Numărul e normalizat la litere și cifre mari și validat local (6-20 caractere, cel puțin o cifră). Interogarea rezultatului nu îl cere.
- `EroareVerificare` are câmpul nou `codSursa` când sursa oficială refuză datele trimise: `serie_talon_invalida`, `vin_invalid` sau `numar_invalid`. În aceste cazuri o reîncercare cu aceleași date nu ajută.
- `Vehicul` are câmpurile noi `serieTalon` (`string | null`) și `serieTalonRespinsa` (`boolean`).
- `vehicule.adauga` acceptă `serieTalon`, necesar pentru monitorizarea automată a rovinietei.
- Utilitare noi: `esteSerieTalonValida` și `normalizeazaSerieTalon`.
- `VERSIUNE_SDK` (trimisă în `User-Agent`) urmează din nou versiunea pachetului.

## 0.1.0 (2026-09-29)

Prima versiune.

- Client `VerificRca` cu `verificari.porneste`, `rezultat`, `asteapta` si `verificaSiAsteapta` pentru RCA, ITP, rovinieta si ARR.
- Gestionarea flotei: `vehicule.lista`, `adauga`, `sterge`.
- Webhook-uri: `parseazaWebhookRezultat` si `verificaWebhookNotificare` (cheie comparata in timp constant).
- Validare locala a numarului de inmatriculare si a VIN-ului, cu aceleasi reguli ca API-ul.
- Erori tipate, retry cu backoff exponential si jitter, `Retry-After` respectat, niciun POST taxat repetat.
- ESM si CommonJS, tipuri TypeScript complete, Node.js 18.17+.

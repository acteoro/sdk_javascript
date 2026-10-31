import { Duration, Effect } from "effect"
import { EroareTimeoutVerificare, type EroareCerere } from "../errors.js"
import { DecodareVinSchema, ImagineMasinaSchema, NumarDisponibilSchema } from "../schemas.js"
import {
	valideazaCerereImagine,
	valideazaNumarDisponibil,
	valideazaVinDecodare,
	type CerereImagine,
} from "../validare.js"
import { citesteRetryAfter, decodeaza, trimite, type Setari } from "./http.js"
import { limiteDin, type Limite } from "./verificari.js"

/** Decodarea unui VIN, cu cota ramasa. */
export type DecodareVin = typeof DecodareVinSchema.Type & {
	/** Cota ramasa dupa aceasta cerere, cand API-ul o trimite. */
	readonly limite?: Limite
}

/** Verdictul DGPCI pentru un numar, cu cota ramasa. */
export type NumarDisponibil = typeof NumarDisponibilSchema.Type & {
	/** Cota ramasa dupa aceasta cerere, cand API-ul o trimite. */
	readonly limite?: Limite
}

/** Poza unei masini, cu cota ramasa si pauza recomandata. */
export type ImagineMasina = typeof ImagineMasinaSchema.Type & {
	/** Cota ramasa dupa aceasta cerere, cand API-ul o trimite. */
	readonly limite?: Limite
	/** La `status: "in-lucru"`: dupa cat timp sa ceri din nou poza, din `Retry-After`. */
	readonly retryAfterMs?: number
}

// DGPCI raspunde sincron si poate dura pana la doua minute.
const TIMEOUT_NUMAR_MS = 150_000

/** POST: decodeaza un VIN. Se taxeaza doar cand marca si modelul sunt gasite. */
export const decodeazaVin = (vin: string): Effect.Effect<DecodareVin, EroareCerere, Setari> =>
	valideazaVinDecodare(vin).pipe(
		Effect.flatMap((v) =>
			trimite({ metoda: "POST", cale: "/api/public/v1/decodare-vin", idempotenta: false, body: { vin: v } }),
		),
		Effect.flatMap((r) => decodeaza(DecodareVinSchema)(r).pipe(Effect.map((d) => cuLimite(d, limiteDin(r))))),
	)

/** POST: verifica la DGPCI daca un numar e liber. Se taxeaza doar cand DGPCI da un verdict. */
export const verificaNumar = (numar: string): Effect.Effect<NumarDisponibil, EroareCerere, Setari> =>
	valideazaNumarDisponibil(numar).pipe(
		Effect.flatMap((n) =>
			trimite({
				metoda: "POST",
				cale: "/api/public/v1/numere-disponibile",
				idempotenta: false,
				body: { numar: n },
				timeoutMinimMs: TIMEOUT_NUMAR_MS,
			}),
		),
		Effect.flatMap((r) => decodeaza(NumarDisponibilSchema)(r).pipe(Effect.map((d) => cuLimite(d, limiteDin(r))))),
	)

/** POST: poza unei masini. Se taxeaza doar cand poza e gata. */
export const imagine = (cerere: CerereImagine): Effect.Effect<ImagineMasina, EroareCerere, Setari> =>
	valideazaCerereImagine(cerere).pipe(
		Effect.flatMap((body) => trimite({ metoda: "POST", cale: "/api/public/v1/imagini-masini", idempotenta: false, body })),
		Effect.flatMap((r) =>
			decodeaza(ImagineMasinaSchema)(r).pipe(
				Effect.map((d): ImagineMasina => {
					const retryAfterMs = d.status === "in-lucru" ? citesteRetryAfter(r.headers) : undefined
					return { ...cuLimite(d, limiteDin(r)), ...(retryAfterMs !== undefined && { retryAfterMs }) }
				}),
			),
		),
	)

/** Optiunile pentru asteptarea unei poze. */
export interface OptiuniAsteptareImagine {
	/** Cat asteptam in total o poza `in-lucru`. Implicit 2 minute. */
	readonly timeoutMs?: number
}

const TIMEOUT_IMAGINE_MS = 2 * 60_000
// Pauza cand serverul nu trimite `Retry-After` si plafonul de jos, ca sa nu
// consumam plafonul zilnic de poze generice.
const PAUZA_IMAGINE_MS = 10_000

/** Cere poza pana nu mai e `in-lucru`, cu pauzele din `Retry-After`. */
export const imagineAsteptata = (
	cerere: CerereImagine,
	optiuni: OptiuniAsteptareImagine = {},
): Effect.Effect<ImagineMasina, EroareCerere | EroareTimeoutVerificare, Setari> =>
	Effect.gen(function* () {
		const timeoutMs = optiuni.timeoutMs ?? TIMEOUT_IMAGINE_MS
		const termen = Date.now() + timeoutMs
		for (;;) {
			const raspuns = yield* imagine(cerere)
			if (raspuns.status !== "in-lucru") return raspuns
			const pauza = Math.max(PAUZA_IMAGINE_MS, raspuns.retryAfterMs ?? 0)
			if (Date.now() + pauza > termen) {
				return yield* Effect.fail(
					new EroareTimeoutVerificare({
						message: `Poza nu a fost gata in ${timeoutMs} ms. Cere-o din nou mai tarziu.`,
						cod: "TIMEOUT_IMAGINE",
					}),
				)
			}
			yield* Effect.sleep(Duration.millis(pauza))
		}
	})

function cuLimite<T extends object>(date: T, limite: Limite | undefined): T & { readonly limite?: Limite } {
	return limite ? { ...date, limite } : date
}

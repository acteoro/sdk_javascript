import { Effect } from "effect"
import { EroareValidare } from "./errors.js"
import type { TipVerificare, UnghiImagine } from "./schemas.js"

// Aceleasi reguli ca prevalidarea din API. O cerere pe care sursa oficiala ar
// refuza-o oricum e oprita aici: nu pleaca pe retea si nu consuma din cota.

const JUDETE =
	"AB|AR|AG|BC|BH|BN|BT|BV|BR|BZ|CS|CL|CJ|CT|CV|DB|DJ|GL|GR|GJ|HD|HR|IL|IS|IF|MM|MH|MS|NT|OT|PH|SM|SJ|SB|SV|TR|TM|TL|VS|VL|VN"

const NUMAR_REGEX = new RegExp(
	`^(B\\d{2,3}[A-Z]{2,3}|(${JUDETE})\\d{2}[A-Z]{2,3}|CD\\d{3}[A-Z]{1,3}|TC\\d{4}[A-Z]{2})$`,
	"i",
)
// Numerele verificate la DGPCI: judet (sau B), cifrele si exact trei litere.
const NUMAR_DGPCI_REGEX = new RegExp(`^(B\\d{2,3}|(${JUDETE})\\d{2})[A-Z]{3}$`, "i")
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i
const LUNGIME_VIN = 17
// Numarul certificatului de inmatriculare: 6-20 litere si cifre, cel putin o cifra.
const SERIE_TALON_REGEX = /^(?=.*\d)[A-Z0-9]{6,20}$/

/** Toate tipurile de verificare acceptate de API, in ordine: `["rca", "itp", "rovinieta", "arr"]`. */
export const TIPURI_VERIFICARE: readonly TipVerificare[] = ["rca", "itp", "rovinieta", "arr"]

/**
 * Aduce un numar de inmatriculare sau un VIN la forma canonica: fara spatii,
 * cratime sau underscore, cu majuscule.
 *
 * @param valoare textul introdus de utilizator.
 * @returns forma normalizata.
 * @example
 * normalizeaza(" b-123 abc ") // "B123ABC"
 */
export function normalizeaza(valoare: string): string {
	return valoare.trim().toUpperCase().replace(/[\s\-_]/g, "")
}

/**
 * Verifica un numar de inmatriculare romanesc: Bucuresti (`B123ABC`), judete
 * (`CJ45XYZ`), corp diplomatic (`CD123A`) si numere temporare (`TC1234AB`).
 * Accepta si forme cu spatii sau cratime.
 *
 * @param valoare numarul de verificat.
 * @returns `true` daca numarul are un format valid.
 * @example
 * esteNumarInmatriculareValid("CJ 45 XYZ") // true
 * esteNumarInmatriculareValid("XX12ABC")   // false: XX nu e un judet
 */
export function esteNumarInmatriculareValid(valoare: string): boolean {
	return NUMAR_REGEX.test(normalizeaza(valoare))
}

/**
 * Verifica o serie de sasiu (VIN) dupa ISO 3779: exact 17 caractere, cifre si
 * litere, fara I, O si Q.
 *
 * @param valoare VIN-ul de verificat (spatiile si cratimele sunt ignorate).
 * @returns `true` daca VIN-ul are un format valid.
 * @example
 * esteVinValid("WVWZZZ1JZXW000001") // true
 * esteVinValid("WVWZZZ1JZXW00000I") // false: litera I nu e permisa
 */
export function esteVinValid(valoare: string): boolean {
	return VIN_REGEX.test(normalizeaza(valoare))
}

/**
 * Aduce numarul certificatului de inmatriculare (talon) la forma canonica:
 * doar litere si cifre, cu majuscule.
 *
 * @param valoare textul introdus de utilizator.
 * @returns forma normalizata.
 * @example
 * normalizeazaSerieTalon(" i 00639603-f ") // "I00639603F"
 */
export function normalizeazaSerieTalon(valoare: string): string {
	return valoare.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/**
 * Verifica forma numarului certificatului de inmatriculare (talon), tiparit jos
 * pe talon: 6-20 litere si cifre, cel putin o cifra. Corectitudinea lui o
 * confirma doar sursa oficiala, impreuna cu numarul si VIN-ul.
 *
 * @param valoare numarul certificatului (spatiile si cratimele sunt ignorate).
 * @returns `true` daca are o forma valida.
 * @example
 * esteSerieTalonValida("I00639603F") // true
 * esteSerieTalonValida("ABCDEF")     // false: nu contine nicio cifra
 */
export function esteSerieTalonValida(valoare: string): boolean {
	return SERIE_TALON_REGEX.test(normalizeazaSerieTalon(valoare))
}

const MESAJ_SERIE_TALON =
	"numarul certificatului de inmatriculare, tiparit jos pe talon la \"Numarul certificatului\" (ex: I00639603F)."

function explicaVin(valoare: string): string {
	if (!valoare) return "Lipseste seria de sasiu (VIN)."
	if (valoare.length !== LUNGIME_VIN) {
		return `Seria de sasiu are ${valoare.length} caractere, sunt necesare exact ${LUNGIME_VIN}.`
	}
	return "Seria de sasiu contine caractere neacceptate. Standardul ISO 3779 exclude literele I, O si Q."
}

/** Datele pentru pornirea unei verificari. */
export interface CerereVerificare {
	/** `rca`, `itp`, `rovinieta` sau `arr`. */
	readonly tip: TipVerificare
	/**
	 * Identificatorul principal:
	 * - `rca`: numar de inmatriculare sau VIN;
	 * - `itp`: VIN (RAR nu cauta dupa numar);
	 * - `rovinieta`: numar de inmatriculare (VIN-ul merge in `serieSasiu`);
	 * - `arr`: numar de inmatriculare (ARR nu cauta dupa VIN).
	 */
	readonly query: string
	/** Seria de sasiu (VIN). Obligatorie la rovinieta, recomandata la RCA. */
	readonly serieSasiu?: string
	/**
	 * Numarul certificatului de inmatriculare (talon), tiparit jos pe talon, ex:
	 * `I00639603F`. Obligatoriu la rovinieta: sursa oficiala il valideaza impreuna
	 * cu numarul si VIN-ul. Ignorat la celelalte tipuri.
	 */
	readonly serieTalon?: string
	/** URL http(s) unde API-ul trimite rezultatul prin POST cand e gata. */
	readonly callbackUrl?: string
}

/** Cererea validata: ce trimitem la API si dupa ce facem polling. */
export interface TintaVerificare {
	readonly tip: TipVerificare
	/** `query` normalizat, trimis la POST. */
	readonly query: string
	readonly serieSasiu: string | null
	/** Numarul talonului normalizat, doar la rovinieta. */
	readonly serieTalon: string | null
	/** Identificatorul folosit de API la polling (la RCA cu VIN, VIN-ul). */
	readonly queryPolling: string
	readonly callbackUrl: string | null
}

const eroare = (message: string, camp: string, acceptate?: readonly string[]) =>
	new EroareValidare({ message, camp, cod: "VALIDARE_LOCALA", ...(acceptate && { acceptate }) })

function valideazaCallbackUrl(raw: string | undefined): Effect.Effect<string | null, EroareValidare> {
	if (raw === undefined || raw.trim() === "") return Effect.succeed(null)
	const trimis = raw.trim()
	if (trimis.length > 2000) {
		return Effect.fail(eroare("`callbackUrl` e prea lung (maxim 2000 de caractere).", "callbackUrl"))
	}
	try {
		const url = new URL(trimis)
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return Effect.fail(eroare("`callbackUrl` trebuie sa foloseasca http sau https.", "callbackUrl"))
		}
		return Effect.succeed(trimis)
	} catch {
		return Effect.fail(eroare("`callbackUrl` trebuie sa fie un URL absolut http(s).", "callbackUrl"))
	}
}

function valideazaIdentificatori(
	tip: TipVerificare,
	query: string,
	serieSasiu: string,
	serieTalon: string,
): Effect.Effect<Omit<TintaVerificare, "callbackUrl">, EroareValidare> {
	if (!query) {
		return Effect.fail(eroare("Lipseste `query` (numar de inmatriculare sau serie de sasiu).", "query"))
	}

	switch (tip) {
		case "rca": {
			if (NUMAR_REGEX.test(query)) {
				if (!serieSasiu) return Effect.succeed({ tip, query, serieSasiu: null, queryPolling: query, serieTalon: null })
				if (!VIN_REGEX.test(serieSasiu)) {
					return Effect.fail(eroare(`\`serieSasiu\` invalid. ${explicaVin(serieSasiu)}`, "serieSasiu"))
				}
				// Cu VIN, API-ul cauta polita dupa VIN, deci si pollingul merge pe VIN.
				return Effect.succeed({ tip, query, serieSasiu, queryPolling: serieSasiu, serieTalon: null })
			}
			if (VIN_REGEX.test(query)) return Effect.succeed({ tip, query, serieSasiu: null, queryPolling: query, serieTalon: null })
			return Effect.fail(
				eroare(
					`\`query\` invalid: se accepta un numar de inmatriculare romanesc (ex: B123ABC) sau o serie de sasiu de ${LUNGIME_VIN} caractere. ${explicaVin(query)}`,
					"query",
				),
			)
		}
		case "itp": {
			const vin = VIN_REGEX.test(query) ? query : VIN_REGEX.test(serieSasiu) ? serieSasiu : null
			if (!vin) {
				return Effect.fail(
					eroare(
						`Verificarea ITP cere seria de sasiu (VIN, ${LUNGIME_VIN} caractere). RAR nu cauta dupa numarul de inmatriculare. ${explicaVin(serieSasiu || query)}`,
						"query",
					),
				)
			}
			return Effect.succeed({ tip, query, serieSasiu: serieSasiu || null, queryPolling: vin, serieTalon: null })
		}
		case "arr": {
			if (!NUMAR_REGEX.test(query)) {
				return Effect.fail(
					eroare("Verificarea ARR cere numarul de inmatriculare in `query` (ex: B123ABC). ARR nu cauta dupa VIN.", "query"),
				)
			}
			return Effect.succeed({ tip, query, serieSasiu: null, queryPolling: query, serieTalon: null })
		}
		case "rovinieta": {
			if (!NUMAR_REGEX.test(query)) {
				return Effect.fail(
					eroare("Verificarea rovinietei cere numarul de inmatriculare in `query` (ex: B123ABC).", "query"),
				)
			}
			if (!VIN_REGEX.test(serieSasiu)) {
				return Effect.fail(
					eroare(`Verificarea rovinietei cere si seria de sasiu in \`serieSasiu\`. ${explicaVin(serieSasiu)}`, "serieSasiu"),
				)
			}
			if (!serieTalon) {
				return Effect.fail(
					eroare(`Verificarea rovinietei cere si \`serieTalon\`: ${MESAJ_SERIE_TALON}`, "serieTalon"),
				)
			}
			if (!SERIE_TALON_REGEX.test(serieTalon)) {
				return Effect.fail(eroare(`\`serieTalon\` invalid: se asteapta ${MESAJ_SERIE_TALON}`, "serieTalon"))
			}
			return Effect.succeed({ tip, query, serieSasiu, queryPolling: query, serieTalon })
		}
	}
}

/** Valideaza si normalizeaza o cerere de verificare, cu aceleasi reguli ca API-ul. */
export function valideazaCerereVerificare(cerere: CerereVerificare): Effect.Effect<TintaVerificare, EroareValidare> {
	const tip = typeof cerere.tip === "string" ? (cerere.tip.toLowerCase() as TipVerificare) : cerere.tip
	if (!TIPURI_VERIFICARE.includes(tip)) {
		return Effect.fail(eroare("`tip` invalid.", "tip", TIPURI_VERIFICARE))
	}
	const query = typeof cerere.query === "string" ? normalizeaza(cerere.query) : ""
	const serieSasiu = typeof cerere.serieSasiu === "string" ? normalizeaza(cerere.serieSasiu) : ""
	const serieTalon = typeof cerere.serieTalon === "string" ? normalizeazaSerieTalon(cerere.serieTalon) : ""

	return Effect.all({
		tinta: valideazaIdentificatori(tip, query, serieSasiu, serieTalon),
		callbackUrl: valideazaCallbackUrl(cerere.callbackUrl),
	}).pipe(Effect.map(({ tinta, callbackUrl }) => ({ ...tinta, callbackUrl })))
}

/** Datele unui vehicul adaugat in flota. */
export interface VehiculNou {
	/** Numarul de inmatriculare. Spatiile si cratimele sunt eliminate. Maxim 20 de caractere. */
	readonly numarInmatriculare?: string
	/** Seria de sasiu (VIN). Necesara pentru ITP si rovinieta. Maxim 50 de caractere. */
	readonly serieSasiu?: string
	/**
	 * Numarul certificatului de inmatriculare (talon), ex: `I00639603F`. Necesar
	 * pentru monitorizarea automata a rovinietei: fara el, rovinieta nu se verifica.
	 */
	readonly serieTalon?: string
	/** Monitorizeaza si copia conforma ARR. Cere un plan activ. */
	readonly arrMonitorizat?: boolean
}

/** Valideaza un vehicul nou cu regulile API-ului: cel putin un identificator. */
export function valideazaVehiculNou(vehicul: VehiculNou): Effect.Effect<Record<string, unknown>, EroareValidare> {
	const numar = vehicul.numarInmatriculare?.trim() ?? ""
	const serie = vehicul.serieSasiu?.trim() ?? ""

	if (numar && (numar.length > 20 || !/^[A-Z0-9\s-]*$/i.test(numar))) {
		return Effect.fail(eroare("`numarInmatriculare` poate contine doar litere, cifre, spatii si cratime (maxim 20).", "numarInmatriculare"))
	}
	if (serie && (serie.length > 50 || !/^[A-Z0-9]*$/i.test(serie))) {
		return Effect.fail(eroare("`serieSasiu` poate contine doar litere si cifre (maxim 50).", "serieSasiu"))
	}

	const serieTalon = vehicul.serieTalon === undefined ? "" : normalizeazaSerieTalon(vehicul.serieTalon)
	if (serieTalon && !SERIE_TALON_REGEX.test(serieTalon)) {
		return Effect.fail(eroare(`\`serieTalon\` invalid: se asteapta ${MESAJ_SERIE_TALON}`, "serieTalon"))
	}

	const numarNormalizat = numar.toUpperCase().replace(/[\s-]+/g, "")
	const serieNormalizata = serie.toUpperCase()
	if (!numarNormalizat && !serieNormalizata) {
		return Effect.fail(eroare("Trimite numarul de inmatriculare sau seria de sasiu.", "numarInmatriculare"))
	}

	return Effect.succeed({
		...(numarNormalizat && { numarInmatriculare: numarNormalizat }),
		...(serieNormalizata && { serieSasiu: serieNormalizata }),
		...(serieTalon && { serieTalon }),
		...(vehicul.arrMonitorizat !== undefined && { arrMonitorizat: vehicul.arrMonitorizat }),
	})
}

// ─── Produsele cu raspuns sincron ────────────────────────────────────────────

/** VIN-ul pentru decodare, normalizat, sau eroarea de format. */
export function valideazaVinDecodare(vin: string): Effect.Effect<string, EroareValidare> {
	const n = normalizeaza(typeof vin === "string" ? vin : "")
	return VIN_REGEX.test(n) ? Effect.succeed(n) : Effect.fail(eroare(explicaVin(n), "vin"))
}

/** Numarul pentru DGPCI, normalizat, sau eroarea de format. */
export function valideazaNumarDisponibil(numar: string): Effect.Effect<string, EroareValidare> {
	const brut = typeof numar === "string" ? numar : ""
	if (/[?*]/.test(brut)) return Effect.fail(eroare("API-ul verifica un singur numar complet, fara `?` sau `*`.", "numar"))
	const n = normalizeaza(brut)
	if (!n) return Effect.fail(eroare("Lipseste numarul de inmatriculare.", "numar"))
	return NUMAR_DGPCI_REGEX.test(n)
		? Effect.succeed(n)
		: Effect.fail(eroare(`Numarul ${n} nu e complet: trimite indicativul judetului, cifrele si trei litere (ex: BV07ABC).`, "numar"))
}

/** Unghiurile acceptate pentru poza unei masini. */
export const UNGHIURI_IMAGINE: readonly UnghiImagine[] = [
	"trei-sferturi",
	"fata",
	"profil",
	"spate",
	"trei-sferturi-dreapta",
	"profil-dreapta",
]

/** Masina pentru care ceri poza. */
export interface CerereImagine {
	/** Marca, ca in talon sau RAR, ex: `Volkswagen`. */
	readonly marca: string
	/** Modelul, ex: `Golf`. */
	readonly model: string
	/** Anul fabricatiei (1950 - anul viitor); alege generatia. */
	readonly an: number
	/** Unghiul pozei. Implicit `"trei-sferturi"`. */
	readonly unghi?: UnghiImagine
	/** Umbra sub masina. Implicit `true`. */
	readonly umbra?: boolean
}

const TEXT_MASINA_REGEX = /^[\p{L}\p{N} ./+&'()-]+$/u

function valideazaTextMasina(valoare: unknown, camp: "marca" | "model"): string | EroareValidare {
	if (typeof valoare !== "string") return eroare(`Trimite \`${camp}\` ca text.`, camp)
	const t = valoare.trim()
	if (!t) return eroare(`\`${camp}\` nu poate fi gol.`, camp)
	if (t.length > 66) return eroare(`\`${camp}\` are cel mult 66 de caractere.`, camp)
	if (!TEXT_MASINA_REGEX.test(t)) {
		return eroare(`\`${camp}\` poate contine doar litere, cifre, spatii si . / + & ' ( ) -`, camp)
	}
	return t
}

/** Corpul cererii de poza, validat ca in API. */
export function valideazaCerereImagine(cerere: CerereImagine): Effect.Effect<Record<string, unknown>, EroareValidare> {
	const marca = valideazaTextMasina(cerere?.marca, "marca")
	if (marca instanceof EroareValidare) return Effect.fail(marca)
	const model = valideazaTextMasina(cerere.model, "model")
	if (model instanceof EroareValidare) return Effect.fail(model)
	const anMaxim = new Date().getFullYear() + 1
	if (!Number.isInteger(cerere.an) || cerere.an < 1950 || cerere.an > anMaxim) {
		return Effect.fail(eroare(`\`an\` trebuie sa fie un numar intreg intre 1950 si ${anMaxim}.`, "an"))
	}
	if (cerere.unghi !== undefined && !UNGHIURI_IMAGINE.includes(cerere.unghi)) {
		return Effect.fail(eroare(`\`unghi\` poate fi: ${UNGHIURI_IMAGINE.join(", ")}.`, "unghi", UNGHIURI_IMAGINE))
	}
	if (cerere.umbra !== undefined && typeof cerere.umbra !== "boolean") {
		return Effect.fail(eroare("Trimite `umbra` ca true sau false.", "umbra"))
	}
	return Effect.succeed({
		marca,
		model,
		an: cerere.an,
		...(cerere.unghi !== undefined && { unghi: cerere.unghi }),
		...(cerere.umbra !== undefined && { umbra: cerere.umbra }),
	})
}

import { ClientVehicule, creeazaRulare, PROFIL_ACTEO, type OptiuniCerere, type OptiuniClient, type Rulare } from "./client.js"
import * as opVerificari from "./internal/verificari.js"
import type { TipVerificare, WebhookNotificare, WebhookRezultat } from "./schemas.js"
import { normalizeaza, type CerereVerificare } from "./validare.js"
import { parseazaWebhookRezultat, verificaWebhookNotificare, type HeadereCerere, type OptiuniWebhookNotificare } from "./webhooks.js"

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

/** Rezultatul final al unei verificari, ingustat pe documentul ei. */
export type RezultatDocument<T extends TipVerificare> = opVerificari.VerificareFinala & {
	/** Documentul verificat. */
	readonly tip: T
}

/** Verificare pusa in coada, ingustata pe documentul ei. */
export type VerificareInCursDocument<T extends TipVerificare> = opVerificari.VerificareInCurs & {
	/** Documentul verificat. */
	readonly tip: T
}

/** Raspunsul la `porneste()` sau `rezultat()`: final sau in curs (`status === "processing"`). */
export type RaspunsDocument<T extends TipVerificare> = RezultatDocument<T> | VerificareInCursDocument<T>

/** Optiunile pentru `porneste()`. */
export interface OptiuniPornire extends OptiuniCerere {
	/** URL http(s) unde API-ul trimite rezultatul prin POST cand e gata. */
	readonly callbackUrl?: string
}

/** Optiunile pentru `verifica()` si `asteapta()`. */
export type OptiuniVerifica = opVerificari.OptiuniAsteptare & OptiuniCerere

/** Identificatorul unei verificari RCA: numar de inmatriculare sau VIN, ori amandoua. */
export type IdentificatorRca =
	| string
	| {
			/** Numarul de inmatriculare. */
			readonly numar?: string
			/** Seria de sasiu (VIN). Cu ea, cautarea in AIDA e mai exacta. */
			readonly vin?: string
	  }

/** Identificatorii unei verificari de rovinieta, toti obligatorii. */
export interface IdentificatorRovinieta {
	/** Numarul de inmatriculare. */
	readonly numar: string
	/** Seria de sasiu (VIN). */
	readonly vin: string
	/** Numarul certificatului de inmatriculare (talon), ex: `I00639603F`. */
	readonly serieTalon: string
}

/** Cum se transforma identificatorul unui document in cererea si referinta API-ului. */
interface Mapare<I> {
	readonly cerere: (id: I) => Omit<CerereVerificare, "callbackUrl">
	readonly referinta: (id: I) => opVerificari.ReferintaVerificare
}

function esteInCurs<T extends TipVerificare>(x: unknown): x is VerificareInCursDocument<T> {
	return typeof x === "object" && x !== null && (x as { status?: unknown }).status === "processing"
}

/**
 * Verificarile pentru un singur document (RCA, ITP, rovinieta sau ARR). Il
 * accesezi prin `acteo.auto.rca`, `acteo.auto.itp` etc., nu il construiesti direct.
 *
 * `verifica()` si `porneste()` consuma din cota planului; `rezultat()` si
 * `asteapta()` sunt gratuite.
 */
export class ClientDocument<T extends TipVerificare, I> {
	readonly #ruleaza: Rulare
	readonly #mapare: Mapare<I>

	/** @internal */
	constructor(ruleaza: Rulare, mapare: Mapare<I>) {
		this.#ruleaza = ruleaza
		this.#mapare = mapare
	}

	/**
	 * Verifica documentul si asteapta rezultatul final de la sursa oficiala.
	 * Daca vehiculul a fost verificat de curand, rezultatul vine imediat.
	 *
	 * @param identificator ce cere sursa oficiala pentru acest document.
	 * @param optiuni `timeoutMs`, `intervalMs` pentru asteptare si `signal`.
	 * @returns rezultatul final.
	 * @throws {@link EroareValidare} identificator invalid, local sau HTTP 400.
	 * @throws {@link EroareLimita} cota zilnica sau lunara atinsa.
	 * @throws {@link EroareVerificare} sursa oficiala nu a putut fi interogata sau a refuzat datele.
	 * @throws {@link EroareTimeoutVerificare} rezultatul nu a venit in `timeoutMs`.
	 */
	verifica(identificator: I, optiuni?: OptiuniVerifica): Promise<RezultatDocument<T>> {
		return this.#ruleaza(
			opVerificari.verificaSiAsteapta(this.#mapare.cerere(identificator), optiuni),
			optiuni,
		) as Promise<RezultatDocument<T>>
	}

	/**
	 * Porneste verificarea fara sa astepte. Primesti rezultatul imediat, daca
	 * vehiculul a fost verificat de curand, sau `status: "processing"`; atunci
	 * afli raspunsul cu {@link ClientDocument.asteapta}, {@link ClientDocument.rezultat}
	 * sau prin webhook la `callbackUrl`.
	 *
	 * @param identificator ce cere sursa oficiala pentru acest document.
	 * @param optiuni `callbackUrl` si `signal`.
	 * @returns rezultatul final sau verificarea in curs.
	 */
	porneste(identificator: I, optiuni?: OptiuniPornire): Promise<RaspunsDocument<T>> {
		const cerere: CerereVerificare = {
			...this.#mapare.cerere(identificator),
			...(optiuni?.callbackUrl !== undefined && { callbackUrl: optiuni.callbackUrl }),
		}
		return this.#ruleaza(opVerificari.porneste(cerere), optiuni) as Promise<RaspunsDocument<T>>
	}

	/**
	 * Interogheaza o singura data rezultatul. Nu consuma din cota.
	 *
	 * @param referinta verificarea in curs primita de la `porneste()` sau identificatorul documentului.
	 * @param optiuni `signal` pentru anulare.
	 * @returns rezultatul final sau verificarea inca in curs.
	 */
	rezultat(referinta: VerificareInCursDocument<T> | I, optiuni?: OptiuniCerere): Promise<RaspunsDocument<T>> {
		return this.#ruleaza(opVerificari.rezultat(this.#referinta(referinta)), optiuni) as Promise<RaspunsDocument<T>>
	}

	/**
	 * Interogheaza periodic pana la rezultatul final. Nu consuma din cota.
	 *
	 * @param referinta verificarea in curs primita de la `porneste()` sau identificatorul documentului.
	 * @param optiuni `timeoutMs`, `intervalMs` si `signal`.
	 * @returns rezultatul final.
	 * @throws {@link EroareTimeoutVerificare} rezultatul nu a venit in `timeoutMs`.
	 */
	asteapta(referinta: VerificareInCursDocument<T> | I, optiuni?: OptiuniVerifica): Promise<RezultatDocument<T>> {
		return this.#ruleaza(
			opVerificari.asteapta(this.#referinta(referinta), optiuni),
			optiuni,
		) as Promise<RezultatDocument<T>>
	}

	#referinta(x: VerificareInCursDocument<T> | I): opVerificari.ReferintaVerificare {
		return esteInCurs<T>(x) ? x : this.#mapare.referinta(x)
	}
}

// RCA: un string de 17 caractere fara I, O, Q e VIN, altfel numar de inmatriculare.
function rcaPe(id: IdentificatorRca): { numar?: string; vin?: string } {
	if (typeof id !== "string") return id
	const n = normalizeaza(id)
	return VIN_REGEX.test(n) ? { vin: n } : { numar: n }
}

const MAPARE_RCA: Mapare<IdentificatorRca> = {
	cerere: (id) => {
		const { numar, vin } = rcaPe(id)
		return numar
			? { tip: "rca", query: numar, ...(vin && { serieSasiu: vin }) }
			: { tip: "rca", query: vin ?? "" }
	},
	// Cu VIN, API-ul cauta doar dupa VIN, deci pollingul merge pe VIN.
	referinta: (id) => {
		const { numar, vin } = rcaPe(id)
		return { tip: "rca", query: normalizeaza(vin ?? numar ?? "") }
	},
}

const MAPARE_ITP: Mapare<string> = {
	cerere: (vin) => ({ tip: "itp", query: vin }),
	referinta: (vin) => ({ tip: "itp", query: normalizeaza(vin) }),
}

const MAPARE_ARR: Mapare<string> = {
	cerere: (numar) => ({ tip: "arr", query: numar }),
	referinta: (numar) => ({ tip: "arr", query: normalizeaza(numar) }),
}

const MAPARE_ROVINIETA: Mapare<IdentificatorRovinieta> = {
	cerere: (id) => ({ tip: "rovinieta", query: id.numar, serieSasiu: id.vin, serieTalon: id.serieTalon }),
	referinta: (id) => ({ tip: "rovinieta", query: normalizeaza(id.numar), serieSasiu: normalizeaza(id.vin) }),
}

/** Asigurarea RCA, din baza AIDA. Accepta numar de inmatriculare, VIN sau amandoua. */
export type ClientRca = ClientDocument<"rca", IdentificatorRca>
/** Inspectia tehnica periodica, din RAR. Accepta doar VIN-ul. */
export type ClientItp = ClientDocument<"itp", string>
/** Rovinieta, din CNAIR. Cere numarul, VIN-ul si numarul talonului. */
export type ClientRovinieta = ClientDocument<"rovinieta", IdentificatorRovinieta>
/** Copia conforma ARR. Accepta doar numarul de inmatriculare. */
export type ClientArr = ClientDocument<"arr", string>

/** Domeniul auto: documentele unei masini si flota monitorizata. */
export class ClientAuto {
	/** Asigurarea RCA: `acteo.auto.rca.verifica("B123ABC")`. */
	readonly rca: ClientRca
	/** ITP: `acteo.auto.itp.verifica("WVWZZZ1JZXW000001")`. */
	readonly itp: ClientItp
	/** Rovinieta: `acteo.auto.rovinieta.verifica({ numar, vin, serieTalon })`. */
	readonly rovinieta: ClientRovinieta
	/** Copia conforma ARR: `acteo.auto.arr.verifica("B123ABC")`. */
	readonly arr: ClientArr
	/** Vehiculele monitorizate din cont: `lista()`, `adauga()`, `sterge()`. */
	readonly flota: ClientVehicule

	/** @internal */
	constructor(ruleaza: Rulare) {
		this.rca = new ClientDocument(ruleaza, MAPARE_RCA)
		this.itp = new ClientDocument(ruleaza, MAPARE_ITP)
		this.rovinieta = new ClientDocument(ruleaza, MAPARE_ROVINIETA)
		this.arr = new ClientDocument(ruleaza, MAPARE_ARR)
		this.flota = new ClientVehicule(ruleaza)
	}
}

/** Citirea webhook-urilor trimise de API. Nu face cereri pe retea. */
export class ClientWebhooks {
	/**
	 * Valideaza corpul unui webhook de rezultat (trimis la `callbackUrl`).
	 *
	 * @param corp corpul cererii, ca string sau obiect deja parsat.
	 * @returns rezultatul verificarii.
	 * @throws {@link EroareWebhook} corp invalid.
	 */
	parseazaRezultat(corp: unknown): WebhookRezultat {
		return parseazaWebhookRezultat(corp)
	}

	/**
	 * Verifica cheia si corpul unui webhook de notificare (ex: `document.expira`).
	 *
	 * @param corp corpul cererii.
	 * @param headers headerele cererii.
	 * @param optiuni `cheie`, cheia de webhook din dashboard.
	 * @returns notificarea validata.
	 * @throws {@link EroareWebhook} cheie lipsa, gresita sau corp invalid.
	 */
	verificaNotificare(corp: unknown, headers: HeadereCerere, optiuni: OptiuniWebhookNotificare): WebhookNotificare {
		return verificaWebhookNotificare(corp, headers, optiuni)
	}
}

/**
 * Clientul API-ului Acteo, organizat pe domenii: `acteo.auto.rca`,
 * `acteo.auto.itp`, `acteo.auto.rovinieta`, `acteo.auto.arr`, `acteo.auto.flota`
 * si `acteo.webhooks`.
 *
 * Toate metodele intorc `Promise` si arunca subclase de {@link VerificRcaError}.
 * Erorile trecatoare sunt reincercate automat, fara sa repete vreodata o
 * verificare taxata.
 *
 * @example
 * import { Acteo } from "@acteo/api"
 *
 * const acteo = new Acteo({ apiKey: process.env.ACTEO_API_KEY })
 * const rca = await acteo.auto.rca.verifica("B123ABC")
 * console.log(rca.status, rca.expiresAt)
 */
export class Acteo {
	/** Documentele unei masini (RCA, ITP, rovinieta, ARR) si flota. */
	readonly auto: ClientAuto
	/** Citirea webhook-urilor. */
	readonly webhooks: ClientWebhooks

	/**
	 * Creeaza un client. Nu face nicio cerere pe retea.
	 *
	 * @param optiuni cheia API si setarile de retea; toate sunt optionale daca
	 *   `ACTEO_API_KEY` e setata.
	 * @throws {@link EroareConfigurare} lipseste cheia API sau o optiune e invalida.
	 */
	constructor(optiuni: OptiuniClient = {}) {
		const ruleaza = creeazaRulare(optiuni, PROFIL_ACTEO)
		this.auto = new ClientAuto(ruleaza)
		this.webhooks = new ClientWebhooks()
	}
}

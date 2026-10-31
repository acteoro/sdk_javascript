import { afterEach, describe, expect, it, vi } from "vitest"
import {
	Acteo,
	EroareLimita,
	EroareServer,
	EroareTimeoutVerificare,
	EroareValidare,
	type OptiuniClient,
} from "../src/index.js"
import { CHEIE, cerere, fetchSimulat } from "./helpers.js"

function acteo(fetch: typeof globalThis.fetch, extra: Partial<OptiuniClient> = {}) {
	return new Acteo({
		apiKey: CHEIE,
		fetch,
		retry: { incercari: 3, intarziereInitialaMs: 1, intarziereMaximaMs: 20_000 },
		...extra,
	})
}

const COTA = {
	"X-RateLimit-Limit-Day": "100",
	"X-RateLimit-Remaining-Day": "99",
	"X-RateLimit-Limit-Month": "1000",
	"X-RateLimit-Remaining-Month": "999",
}

afterEach(() => {
	vi.useRealTimers()
})

const decodare = {
	vin: "WVWZZZ1KZBW000000",
	gasit: true,
	taxat: true,
	marca: "Volkswagen",
	model: "Golf",
	anFabricatie: 2011,
	sursaAn: "pozitia-10",
	modelePosibile: [],
	structura: {
		wmi: "WVW",
		vds: "ZZZ1KZ",
		vis: "BW000000",
		regiune: "Europa",
		tara: "Germania",
		cifraControl: "neaplicabila",
		cifraControlAsteptata: null,
		aniPosibili: [2011],
	},
}

describe("auto.vin.decodeaza", () => {
	it("trimite VIN-ul normalizat si intoarce decodarea cu cota", async () => {
		const fetch = fetchSimulat({ body: decodare, headers: COTA })
		const d = await acteo(fetch).auto.vin.decodeaza(" wvwzzz1kzbw000000 ")
		const c = cerere(fetch)
		expect(c.metoda).toBe("POST")
		expect(c.url.pathname).toBe("/api/public/v1/decodare-vin")
		expect(c.body).toEqual({ vin: "WVWZZZ1KZBW000000" })
		expect(d.marca).toBe("Volkswagen")
		expect(d.structura.aniPosibili).toEqual([2011])
		expect(d.limite).toEqual({ zi: { limita: 100, ramase: 99 }, luna: { limita: 1000, ramase: 999 } })
	})

	it("opreste local un VIN invalid, fara cerere", async () => {
		const fetch = fetchSimulat()
		await expect(acteo(fetch).auto.vin.decodeaza("WVWZZZ1KZBW00000O")).rejects.toThrow(EroareValidare)
		expect(fetch).not.toHaveBeenCalled()
	})

	it("PLAFON_NETAXAT devine EroareLimita, fara reincercare", async () => {
		const fetch = fetchSimulat({ status: 429, body: { error: "Plafon", code: "PLAFON_NETAXAT" } })
		const err = await acteo(fetch).auto.vin.decodeaza(decodare.vin).catch((e: unknown) => e)
		expect(err).toBeInstanceOf(EroareLimita)
		expect((err as EroareLimita).cod).toBe("PLAFON_NETAXAT")
		expect(fetch).toHaveBeenCalledTimes(1)
	})
})

describe("auto.numere.verifica", () => {
	it("trimite numarul normalizat si intoarce verdictul", async () => {
		const fetch = fetchSimulat({ body: { numar: "BV07ABC", disponibil: true, mesaj: null }, headers: COTA })
		const r = await acteo(fetch).auto.numere.verifica("bv 07 abc")
		const c = cerere(fetch)
		expect(c.url.pathname).toBe("/api/public/v1/numere-disponibile")
		expect(c.body).toEqual({ numar: "BV07ABC" })
		expect(r.disponibil).toBe(true)
		expect(r.limite?.zi.ramase).toBe(99)
	})

	it("opreste local numerele incomplete sau cu wildcard", async () => {
		const fetch = fetchSimulat()
		const a = acteo(fetch)
		await expect(a.auto.numere.verifica("BV07AB")).rejects.toThrow(EroareValidare)
		await expect(a.auto.numere.verifica("BV07A?C")).rejects.toThrow(/`\?`/)
		await expect(a.auto.numere.verifica("XX07ABC")).rejects.toThrow(EroareValidare)
		expect(fetch).not.toHaveBeenCalled()
		const ok = fetchSimulat({ body: { numar: "B123ABC", disponibil: false, mesaj: "Inregistrat" } })
		await expect(acteo(ok).auto.numere.verifica("B 123 ABC")).resolves.toMatchObject({ disponibil: false })
	})

	it("NUMAR_RESPINS (422) e EroareValidare", async () => {
		const fetch = fetchSimulat({ status: 422, body: { error: "Respins", code: "NUMAR_RESPINS" } })
		const err = await acteo(fetch).auto.numere.verifica("BV07ABC").catch((e: unknown) => e)
		expect(err).toBeInstanceOf(EroareValidare)
		expect((err as EroareValidare).cod).toBe("NUMAR_RESPINS")
	})

	it("reincearca OCUPAT dupa Retry-After", async () => {
		vi.useFakeTimers()
		const fetch = fetchSimulat(
			{ status: 503, body: { error: "Ocupat", code: "OCUPAT" }, headers: { "Retry-After": "10" } },
			{ body: { numar: "BV07ABC", disponibil: true, mesaj: null } },
		)
		const p = acteo(fetch).auto.numere.verifica("BV07ABC")
		await vi.advanceTimersByTimeAsync(9_000)
		expect(fetch).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(2_000)
		await expect(p).resolves.toMatchObject({ disponibil: true })
		expect(fetch).toHaveBeenCalledTimes(2)
	})

	it.each([
		[504, "TIMEOUT"],
		[502, "EROARE_DGPCI"],
		[503, "INDISPONIBIL"],
	])("nu repeta %i %s: verificarea a rulat sau nu se rezolva repetand", async (status, cod) => {
		const fetch = fetchSimulat({ status, body: { error: "x", code: cod } })
		const err = await acteo(fetch).auto.numere.verifica("BV07ABC").catch((e: unknown) => e)
		expect(err).toBeInstanceOf(EroareServer)
		expect((err as EroareServer).cod).toBe(cod)
		expect(fetch).toHaveBeenCalledTimes(1)
	})

	it("are un timeout de cel putin 150 s, peste timeoutMs din client", async () => {
		vi.useFakeTimers()
		let semnal: AbortSignal | undefined
		const fetch = vi.fn(
			(_url: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((resolve) => {
					semnal = init?.signal ?? undefined
					setTimeout(() => resolve(new Response(JSON.stringify({ numar: "BV07ABC", disponibil: true, mesaj: null }))), 100_000)
				}),
		)
		const p = acteo(fetch, { timeoutMs: 1_000 }).auto.numere.verifica("BV07ABC")
		await vi.advanceTimersByTimeAsync(100_000)
		await expect(p).resolves.toMatchObject({ disponibil: true })
		expect(semnal?.aborted).toBe(false)
	})
})

const imagineGata = {
	gata: true,
	status: "gata",
	taxat: true,
	url: "https://example.com/golf.webp",
	expiraLa: "2026-11-01T10:00:00.000Z",
	unghi: "trei-sferturi",
	umbra: true,
	latime: 1600,
	inaltime: 900,
	marca: "Volkswagen",
	model: "Golf",
	generatie: { eticheta: "Volkswagen Golf VII", anDe: 2012, anPana: 2019, caroserie: "5-door hatchback" },
}
const imagineInLucru = { ...imagineGata, gata: false, status: "in-lucru", taxat: false, generatie: null }

describe("auto.imagini", () => {
	it("obtine trimite doar campurile date si decodeaza poza", async () => {
		const fetch = fetchSimulat({ body: imagineGata, headers: COTA })
		const p = await acteo(fetch).auto.imagini.obtine({ marca: " Volkswagen ", model: "Golf", an: 2015, unghi: "fata" })
		const c = cerere(fetch)
		expect(c.url.pathname).toBe("/api/public/v1/imagini-masini")
		expect(c.body).toEqual({ marca: "Volkswagen", model: "Golf", an: 2015, unghi: "fata" })
		expect(p.expiraLa).toBeInstanceOf(Date)
		expect(p.generatie?.anPana).toBe(2019)
		expect(p.retryAfterMs).toBeUndefined()
	})

	it("la in-lucru expune retryAfterMs", async () => {
		const fetch = fetchSimulat({ body: imagineInLucru, headers: { "Retry-After": "15" } })
		const p = await acteo(fetch).auto.imagini.obtine({ marca: "Volkswagen", model: "Golf", an: 2015 })
		expect(p.status).toBe("in-lucru")
		expect(p.retryAfterMs).toBe(15_000)
	})

	it("valideaza local marca, anul si unghiul", async () => {
		const fetch = fetchSimulat()
		const a = acteo(fetch)
		await expect(a.auto.imagini.obtine({ marca: "", model: "Golf", an: 2015 })).rejects.toThrow(/marca/)
		await expect(a.auto.imagini.obtine({ marca: "VW", model: "Golf<script>", an: 2015 })).rejects.toThrow(EroareValidare)
		await expect(a.auto.imagini.obtine({ marca: "VW", model: "Golf", an: 1900 })).rejects.toThrow(/1950/)
		await expect(
			a.auto.imagini.obtine({ marca: "VW", model: "Golf", an: 2015, unghi: "sus" as never }),
		).rejects.toThrow(/unghi/)
		expect(fetch).not.toHaveBeenCalled()
	})

	it("asteapta cere din nou dupa Retry-After pana nu mai e in-lucru", async () => {
		vi.useFakeTimers()
		const fetch = fetchSimulat(
			{ body: imagineInLucru, headers: { "Retry-After": "20" } },
			{ body: imagineGata },
		)
		const p = acteo(fetch).auto.imagini.asteapta({ marca: "Volkswagen", model: "Golf", an: 2015 })
		await vi.advanceTimersByTimeAsync(19_000)
		expect(fetch).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(2_000)
		await expect(p).resolves.toMatchObject({ status: "gata" })
	})

	it("asteapta renunta dupa timeoutMs", async () => {
		vi.useFakeTimers()
		const fetch = fetchSimulat(
			{ body: imagineInLucru, headers: { "Retry-After": "10" } },
			{ body: imagineInLucru, headers: { "Retry-After": "10" } },
		)
		const p = acteo(fetch)
			.auto.imagini.asteapta({ marca: "Volkswagen", model: "Golf", an: 2015 }, { timeoutMs: 15_000 })
			.catch((e: unknown) => e)
		await vi.advanceTimersByTimeAsync(20_000)
		expect(await p).toBeInstanceOf(EroareTimeoutVerificare)
		expect(fetch).toHaveBeenCalledTimes(2)
	})
})

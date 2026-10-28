import { afterEach, describe, expect, it, vi } from "vitest"
import { Acteo, EroareConfigurare, EroareValidare, VerificRca, type OptiuniClient } from "../src/index.js"
import { CHEIE, SERIE_TALON, VIN, cerere, fetchSimulat, rezultatValid } from "./helpers.js"

function acteo(fetch: typeof globalThis.fetch, extra: Partial<OptiuniClient> = {}) {
	return new Acteo({
		apiKey: CHEIE,
		fetch,
		retry: { incercari: 3, intarziereInitialaMs: 1, intarziereMaximaMs: 5 },
		...extra,
	})
}

const rezultatVin = { ...rezultatValid, query: VIN, numarInmatriculare: null, serieSasiu: VIN }

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllEnvs()
})

describe("Acteo: configurare", () => {
	it("adresa implicita e api.acteo.ro, cu User-Agent acteo-sdk-js", async () => {
		const fetch = fetchSimulat({ body: rezultatValid })
		await acteo(fetch).auto.rca.verifica("B123ABC")
		const c = cerere(fetch)
		expect(c.url.origin).toBe("https://api.acteo.ro")
		expect(c.url.pathname).toBe("/api/public/v1/verificare")
		expect(c.headers.get("user-agent")).toMatch(/^acteo-sdk-js\//)
	})

	it("citeste cheia din ACTEO_API_KEY, apoi din VERIFICRCA_API_KEY", async () => {
		vi.stubEnv("ACTEO_API_KEY", "")
		vi.stubEnv("VERIFICRCA_API_KEY", CHEIE)
		const fetch = fetchSimulat({ body: { vehicule: [] } })
		await new Acteo({ fetch }).auto.flota.lista()
		expect(cerere(fetch).headers.get("authorization")).toBe(`Bearer ${CHEIE}`)

		vi.stubEnv("ACTEO_API_KEY", "acteo_cheie_0123456789abcdef")
		const fetch2 = fetchSimulat({ body: { vehicule: [] } })
		await new Acteo({ fetch: fetch2 }).auto.flota.lista()
		expect(cerere(fetch2).headers.get("authorization")).toBe("Bearer acteo_cheie_0123456789abcdef")
	})

	it("fara cheie arunca EroareConfigurare care numeste ACTEO_API_KEY", () => {
		vi.stubEnv("ACTEO_API_KEY", "")
		vi.stubEnv("VERIFICRCA_API_KEY", "")
		expect(() => new Acteo({ fetch: fetchSimulat() })).toThrow(/ACTEO_API_KEY/)
		expect(() => new Acteo({ fetch: fetchSimulat() })).toThrow(EroareConfigurare)
	})

	it("clientul legacy VerificRca ramane pe www.verificrca.ro", async () => {
		const fetch = fetchSimulat({ body: { vehicule: [] } })
		await new VerificRca({ apiKey: CHEIE, fetch }).vehicule.lista()
		expect(cerere(fetch).url.origin).toBe("https://www.verificrca.ro")
		expect(cerere(fetch).headers.get("user-agent")).toMatch(/^verificrca-sdk-js\//)
	})
})

describe("Acteo: documente", () => {
	it("rca cu numar trimite numarul ca query", async () => {
		const fetch = fetchSimulat({ body: rezultatValid })
		const r = await acteo(fetch).auto.rca.verifica("b-123 abc")
		expect(cerere(fetch).body).toEqual({ tip: "rca", query: "B123ABC" })
		expect(r.tip).toBe("rca")
		expect(r.expiresAt).toBeInstanceOf(Date)
	})

	it("rca cu un string de 17 caractere il trateaza ca VIN", async () => {
		const fetch = fetchSimulat({ body: rezultatVin })
		await acteo(fetch).auto.rca.verifica(VIN.toLowerCase())
		expect(cerere(fetch).body).toEqual({ tip: "rca", query: VIN })
	})

	it("rca cu numar si VIN trimite VIN-ul in serieSasiu", async () => {
		const fetch = fetchSimulat({ body: rezultatVin })
		await acteo(fetch).auto.rca.verifica({ numar: "B123ABC", vin: VIN })
		expect(cerere(fetch).body).toEqual({ tip: "rca", query: "B123ABC", serieSasiu: VIN })
	})

	it("rca fara identificator e respins local, fara cerere", async () => {
		const fetch = fetchSimulat()
		await expect(acteo(fetch).auto.rca.verifica({})).rejects.toBeInstanceOf(EroareValidare)
		expect(fetch).not.toHaveBeenCalled()
	})

	it("itp cere VIN; un numar e respins local", async () => {
		const fetch = fetchSimulat({ body: { ...rezultatVin, tip: "itp" } })
		await acteo(fetch).auto.itp.verifica(VIN)
		expect(cerere(fetch).body).toEqual({ tip: "itp", query: VIN })
		await expect(acteo(fetchSimulat()).auto.itp.verifica("B123ABC")).rejects.toBeInstanceOf(EroareValidare)
	})

	it("arr trimite numarul", async () => {
		const fetch = fetchSimulat({ body: { ...rezultatValid, tip: "arr" } })
		await acteo(fetch).auto.arr.verifica("B123ABC")
		expect(cerere(fetch).body).toEqual({ tip: "arr", query: "B123ABC" })
	})

	it("rovinieta trimite numarul, VIN-ul si numarul talonului", async () => {
		const fetch = fetchSimulat({ body: { ...rezultatValid, tip: "rovinieta", serieSasiu: VIN } })
		await acteo(fetch).auto.rovinieta.verifica({ numar: "B123ABC", vin: VIN, serieTalon: SERIE_TALON })
		expect(cerere(fetch).body).toEqual({ tip: "rovinieta", query: "B123ABC", serieSasiu: VIN, serieTalon: SERIE_TALON })
	})
})

describe("Acteo: porneste, rezultat, asteapta", () => {
	const inCurs = { tip: "itp", query: VIN, status: "processing" }

	it("porneste trimite callbackUrl si intoarce verificarea in curs", async () => {
		const fetch = fetchSimulat({
			status: 202,
			body: { ...inCurs, requestId: "req_1", pollUrl: `GET /api/public/v1/verificare?tip=itp&query=${VIN}&since=9` },
		})
		const r = await acteo(fetch).auto.itp.porneste(VIN, { callbackUrl: "https://example.com/hook" })
		expect(cerere(fetch).body).toEqual({ tip: "itp", query: VIN, callbackUrl: "https://example.com/hook" })
		expect(r).toMatchObject({ status: "processing", tip: "itp", since: 9, requestId: "req_1" })
	})

	it("asteapta primeste verificarea in curs si pastreaza since", async () => {
		vi.useFakeTimers()
		const fetch = fetchSimulat(
			{ status: 202, body: { ...inCurs, pollUrl: `GET /api/public/v1/verificare?tip=itp&query=${VIN}&since=5` } },
			{ body: inCurs },
			{ body: { ...rezultatVin, tip: "itp" } },
		)
		const client = acteo(fetch)
		const r = await client.auto.itp.porneste(VIN)
		if (r.status !== "processing") throw new Error("neasteptat")
		const promisiune = client.auto.itp.asteapta(r)
		await vi.advanceTimersByTimeAsync(10_000)
		expect((await promisiune).status).toBe("valid")
		expect(cerere(fetch, 1).url.searchParams.get("since")).toBe("5")
	})

	it("rezultat accepta direct identificatorul; la RCA cu VIN interogheaza dupa VIN", async () => {
		const fetch = fetchSimulat({ body: rezultatVin })
		await acteo(fetch).auto.rca.rezultat({ numar: "B123ABC", vin: VIN })
		const c = cerere(fetch)
		expect(c.metoda).toBe("GET")
		expect(c.url.searchParams.get("tip")).toBe("rca")
		expect(c.url.searchParams.get("query")).toBe(VIN)
	})

	it("rezultat la rovinieta trimite si seria de sasiu", async () => {
		const fetch = fetchSimulat({ body: { ...rezultatValid, tip: "rovinieta", serieSasiu: VIN } })
		await acteo(fetch).auto.rovinieta.rezultat({ numar: "b123abc", vin: VIN, serieTalon: SERIE_TALON })
		const c = cerere(fetch)
		expect(c.url.searchParams.get("query")).toBe("B123ABC")
		expect(c.url.searchParams.get("serieSasiu")).toBe(VIN)
		expect(c.url.searchParams.get("serieTalon")).toBeNull()
	})
})

describe("Acteo: flota si webhook-uri", () => {
	it("flota.lista foloseste endpoint-ul de vehicule", async () => {
		const fetch = fetchSimulat({ body: { vehicule: [] } })
		expect(await acteo(fetch).auto.flota.lista()).toEqual([])
		expect(cerere(fetch).url.pathname).toBe("/api/public/v1/vehicule")
	})

	it("webhooks.parseazaRezultat valideaza corpul", () => {
		const corp = { requestId: "req_1", tip: "rca", query: "B123ABC", serieSasiu: null, status: "valid", result: rezultatValid, checkedAt: rezultatValid.checkedAt }
		const w = acteo(fetchSimulat()).webhooks.parseazaRezultat(JSON.stringify(corp))
		expect(w.requestId).toBe("req_1")
	})
})

import { afterAll, describe, expect, it } from "vitest"
import {
	EroareAutentificare,
	EroareConflict,
	EroareNegasit,
	Acteo,
	type VerificareFinala,
	type Vehicul,
} from "../src/index.js"

// Teste pe API-ul real. Configurarea sta in .env.e2e (vezi .env.e2e.example).
// Testele care costa (cota, verificari pe surse) ruleaza doar cu flag explicit.

const env = process.env
const CHEIE = env.ACTEO_API_KEY?.trim() || undefined
const BASE_URL = env.ACTEO_BASE_URL?.trim() || undefined
const NUMAR = env.ACTEO_E2E_NUMAR?.trim() || undefined
const VIN = env.ACTEO_E2E_VIN?.trim() || undefined
const CU_VERIFICARI = env.ACTEO_E2E_VERIFICARI === "1"
const CU_FLOTA = env.ACTEO_E2E_FLOTA === "1"

const STATUSURI_FINALE = ["valid", "warning", "expired", "not_found"]

function client(apiKey = CHEIE): Acteo {
	return new Acteo({
		...(apiKey && { apiKey }),
		...(BASE_URL && { baseUrl: BASE_URL }),
		userAgent: "e2e",
	})
}

function verificaFinal(r: VerificareFinala) {
	expect(STATUSURI_FINALE).toContain(r.status)
	expect(r.checkedAt).toBeInstanceOf(Date)
	expect(Number.isNaN(r.checkedAt.getTime())).toBe(false)
	if (r.expiresAt !== null) expect(r.expiresAt).toBeInstanceOf(Date)
}

describe("autentificare", () => {
	it("o cheie inexistenta primeste EroareAutentificare (401)", async () => {
		const err = await client("e2e_cheie_inexistenta_00000").auto.flota.lista().catch((e: unknown) => e)
		expect(err).toBeInstanceOf(EroareAutentificare)
		expect(err).toMatchObject({ status: 401 })
	})
})

describe.skipIf(!CHEIE)("auto.flota.lista (gratuit)", () => {
	it("intoarce vehiculele contului, cu datele decodate", async () => {
		const vehicule = await client().auto.flota.lista()
		expect(Array.isArray(vehicule)).toBe(true)
		for (const v of vehicule) {
			expect(typeof v.id).toBe("string")
			expect(typeof v.activ).toBe("boolean")
			expect(v.createdAt).toBeInstanceOf(Date)
			for (const data of [v.rcaExpiraLa, v.itpExpiraLa, v.rovinietaExpiraLa, v.arrExpiraLa]) {
				if (data !== null) expect(data).toBeInstanceOf(Date)
			}
		}
	})
})

describe.skipIf(!CHEIE || !CU_FLOTA || !NUMAR)("auto.flota.adauga / sterge (ACTEO_E2E_FLOTA=1)", () => {
	// Construit lazy: callback-ul unui describe sarit ruleaza oricum la colectare.
	let acteo: Acteo
	let creatId: string | undefined

	afterAll(async () => {
		// Curatenie si cand un test pica la jumatate.
		if (creatId && acteo) await acteo.auto.flota.sterge(creatId).catch(() => undefined)
	})

	it("adauga vehiculul, il gaseste in lista, il sterge", async () => {
		acteo = client()
		let adaugat: Vehicul
		try {
			adaugat = await acteo.auto.flota.adauga({ numarInmatriculare: NUMAR!, ...(VIN && { serieSasiu: VIN }) })
		} catch (err) {
			// Vehiculul e deja in cont: nu il atingem, validam doar raspunsul 409.
			if (err instanceof EroareConflict) {
				expect(err).toMatchObject({ status: 409 })
				return
			}
			throw err
		}

		const id = adaugat.id
		creatId = id
		expect(adaugat.numarInmatriculare).toBe(NUMAR!.toUpperCase().replace(/[\s-]+/g, ""))
		expect((await acteo.auto.flota.lista()).some((v) => v.id === id)).toBe(true)

		await acteo.auto.flota.sterge(id)
		creatId = undefined
		expect((await acteo.auto.flota.lista()).some((v) => v.id === id)).toBe(false)

		await expect(acteo.auto.flota.sterge(id)).rejects.toBeInstanceOf(EroareNegasit)
	})
})

describe.skipIf(!CHEIE || !CU_VERIFICARI || !NUMAR)("verificari (ACTEO_E2E_VERIFICARI=1, consuma din cota)", () => {
	it("RCA: porneste, asteapta si reciteste rezultatul gratuit", async () => {
		const acteo = client()
		const pornit = await acteo.auto.rca.porneste(VIN ? { numar: NUMAR!, vin: VIN } : NUMAR!)
		expect(pornit.limite?.zi.limita).toBeGreaterThan(0)

		const final = pornit.status === "processing" ? await acteo.auto.rca.asteapta(pornit) : pornit
		verificaFinal(final)

		// GET-ul nu consuma din cota si trebuie sa dea acelasi rezultat.
		const recitit = await acteo.auto.rca.rezultat(final.query)
		expect(recitit.status).toBe(final.status)
	})

	it.skipIf(!VIN)("ITP dupa VIN, cu verifica", async () => {
		const itp = await client().auto.itp.verifica(VIN!)
		verificaFinal(itp)
		expect(itp.tip).toBe("itp")
	})
})

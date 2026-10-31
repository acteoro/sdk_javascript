import { describe, expect, it } from "vitest"
import {
	EroareConflict,
	EroareInterzis,
	EroareNegasit,
	EroareWebhook,
	parseazaWebhookRezultat,
	verificaWebhookNotificare,
} from "../src/index.js"
import { VIN, cerere, client, fetchSimulat, rezultatValid } from "./helpers.js"

const vehicul = {
	id: "6f2c1b9e-0000-4000-8000-000000000001",
	numarInmatriculare: "B123ABC",
	serieSasiu: VIN,
	serieTalon: "I00639603F",
	serieTalonRespinsa: false,
	rcaExpiraLa: "2027-03-01T00:00:00.000Z",
	itpExpiraLa: null,
	rovinietaExpiraLa: "2026-12-31T00:00:00.000Z",
	arrExpiraLa: null,
	arrMonitorizat: false,
	activ: true,
	createdAt: "2026-09-01T08:00:00.000Z",
	campNouDeLaServer: "ignorat",
}

describe("vehicule", () => {
	it("lista decodeaza datele", async () => {
		const fetch = fetchSimulat({ body: { vehicule: [vehicul] } })
		const [v] = await client(fetch).vehicule.lista()
		expect(v?.rcaExpiraLa).toBeInstanceOf(Date)
		expect(v?.itpExpiraLa).toBeNull()
		expect(v).not.toHaveProperty("campNouDeLaServer")
		expect(v).toMatchObject({ serieTalon: "I00639603F", serieTalonRespinsa: false })
	})

	it("lista tolereaza un server fara campurile talonului", async () => {
		const { serieTalon: _s, serieTalonRespinsa: _r, ...vechi } = vehicul
		const fetch = fetchSimulat({ body: { vehicule: [vechi] } })
		const [v] = await client(fetch).vehicule.lista()
		expect(v).toMatchObject({ serieTalon: null, serieTalonRespinsa: false })
	})

	it("adauga trimite forma canonica", async () => {
		const fetch = fetchSimulat({ status: 201, body: { vehicul } })
		const v = await client(fetch).vehicule.adauga({ numarInmatriculare: "b 123-abc", arrMonitorizat: false })
		expect(v.id).toBe(vehicul.id)
		expect(cerere(fetch).body).toEqual({ numarInmatriculare: "B123ABC", arrMonitorizat: false })
	})

	it("adauga trimite numarul talonului", async () => {
		const fetch = fetchSimulat({ status: 201, body: { vehicul } })
		await client(fetch).vehicule.adauga({ numarInmatriculare: "B123ABC", serieSasiu: VIN, serieTalon: "i 00639603 f" })
		expect(cerere(fetch).body).toEqual({ numarInmatriculare: "B123ABC", serieSasiu: VIN, serieTalon: "I00639603F" })
	})

	it("409 VEHICUL_EXISTENT si 403 LIMIT_ATINS", async () => {
		const f1 = fetchSimulat({ status: 409, body: { error: "Exista deja.", code: "VEHICUL_EXISTENT" } })
		await expect(client(f1).vehicule.adauga({ numarInmatriculare: "B123ABC" })).rejects.toBeInstanceOf(EroareConflict)

		const f2 = fetchSimulat({ status: 403, body: { error: "Limita.", code: "LIMIT_ATINS", limita: 5 } })
		const err = await client(f2).vehicule.adauga({ numarInmatriculare: "B123ABC" }).catch((e: unknown) => e)
		expect(err).toBeInstanceOf(EroareInterzis)
		expect(err).toMatchObject({ cod: "LIMIT_ATINS", limita: 5 })
	})

	it("sterge encodeaza id-ul si mapeaza 404", async () => {
		const f1 = fetchSimulat({ body: { success: true } })
		await client(f1).vehicule.sterge("abc/def")
		expect(cerere(f1).metoda).toBe("DELETE")
		expect(cerere(f1).url.pathname).toBe("/api/public/v1/vehicule/abc%2Fdef")

		const f2 = fetchSimulat({ status: 404, body: { error: "Vehicul negasit.", code: "NEGASIT" } })
		await expect(client(f2).vehicule.sterge("x")).rejects.toBeInstanceOf(EroareNegasit)
	})
})

describe("webhook-uri", () => {
	it("parseaza rezultatul unei verificari din string", () => {
		const corp = JSON.stringify({
			requestId: "req_1",
			tip: "rca",
			query: "B123ABC",
			serieSasiu: null,
			status: "valid",
			result: rezultatValid,
			checkedAt: rezultatValid.checkedAt,
		})
		const w = parseazaWebhookRezultat(corp)
		expect(w.requestId).toBe("req_1")
		expect(w.result?.expiresAt).toBeInstanceOf(Date)
	})

	it("parseaza rezultatul de eroare", () => {
		const w = parseazaWebhookRezultat({
			requestId: "req_2",
			tip: "itp",
			query: VIN,
			serieSasiu: VIN,
			status: "error",
			result: null,
			checkedAt: null,
			error: "Verificarea nu s-a putut finaliza.",
		})
		expect(w.status).toBe("error")
	})

	it("respinge JSON invalid", () => {
		expect(() => parseazaWebhookRezultat("{nu e json")).toThrow(EroareWebhook)
	})

	const expira = {
		event: "document.expira",
		id: "liv_1",
		vehicul: { id: "v1", numarInmatriculare: "B123ABC", serieSasiu: null },
		document: "itp",
		expiraLa: "2026-10-10T00:00:00.000Z",
		zileRamase: 11,
		prag: 14,
		trimisLa: "2026-09-29T10:00:00.000Z",
	}

	it("accepta notificarea cu cheia corecta, din Headers sau obiect Node", () => {
		const cheie = "whsec_abc123"
		const n1 = verificaWebhookNotificare(JSON.stringify(expira), new Headers({ "X-Acteo-Key": cheie }), { cheie })
		expect(n1.event).toBe("document.expira")

		const n2 = verificaWebhookNotificare(Buffer.from(JSON.stringify(expira)), { "x-acteo-key": cheie }, { cheie })
		if (n2.event !== "document.expira") throw new Error("neasteptat")
		expect(n2.expiraLa).toBeInstanceOf(Date)
		expect(n2.prag).toBe(14)
	})

	it("accepta evenimentul de test", () => {
		const n = verificaWebhookNotificare(
			{ event: "webhook.test", id: "t1", mesaj: "Test", trimisLa: "2026-09-29T10:00:00.000Z" },
			{ "X-Acteo-Key": "k" },
			{ cheie: "k" },
		)
		expect(n.event).toBe("webhook.test")
	})

	it("respinge cheia gresita sau lipsa", () => {
		expect(() => verificaWebhookNotificare(expira, { "x-acteo-key": "gresit" }, { cheie: "whsec_abc" })).toThrow(
			EroareWebhook,
		)
		expect(() => verificaWebhookNotificare(expira, {}, { cheie: "whsec_abc" })).toThrow(/X-Acteo-Key/)
	})

	it("citeste si headerul vechi X-Verificrca-Key cand lipseste X-Acteo-Key", () => {
		const cheie = "whsec_abc123"
		expect(verificaWebhookNotificare(expira, { "X-Verificrca-Key": cheie }, { cheie }).event).toBe("document.expira")
		// Headerul nou are prioritate: o cheie veche corecta nu salveaza una noua gresita.
		expect(() =>
			verificaWebhookNotificare(expira, { "X-Acteo-Key": "gresit", "X-Verificrca-Key": cheie }, { cheie }),
		).toThrow(EroareWebhook)
	})

	const comun = { id: "liv_2", trimisLa: "2026-10-30T10:00:00.000Z" }
	const evenimente = [
		{
			event: "dosar.eveniment",
			...comun,
			dosar: { id: "d1", numar: "1234/3/2024", eticheta: null },
			eveniment: { tip: "termen_nou", descriere: "Termen nou", institutie: "Tribunalul Bucuresti" },
		},
		{
			event: "dosar.termen",
			...comun,
			dosar: { id: "d1", numar: "1234/3/2024", eticheta: "Litigiu" },
			sedinta: { data: "2026-11-02T00:00:00.000Z", ora: "09:00", institutie: null, complet: "C1" },
			zileRamase: 3,
		},
		{
			event: "firma.schimbare",
			...comun,
			firma: { id: "f1", denumire: "Exemplu SRL" },
			schimbari: [{ camp: "platitor_tva", valoareVeche: "nu", valoareNoua: "da", dataEfect: "2026-11-01" }],
		},
		{
			event: "firma.dosar",
			...comun,
			firma: { id: "f1", denumire: "Exemplu SRL" },
			dosar: { numar: "99/2/2026", institutie: "Tribunalul Cluj", calitateParte: "Parat", obiect: null, categorie: null, insolventa: null },
		},
		{
			event: "marca.schimbare",
			...comun,
			marca: { id: "m1", st13: "RO500000000000001", nume: "EXEMPLU", oficiu: "RO", numarDepozit: "M 2020 00001" },
			schimbare: "reinnoita",
			valoareVeche: "2026-11-01",
			valoareNoua: "2036-11-01",
		},
		{
			event: "marca.expira",
			...comun,
			marca: { id: "m1", st13: "EM500000000000001", nume: "EXEMPLU", oficiu: "EM", numarDepozit: "000000001" },
			expiraLa: "2027-01-01",
			prag: "3l",
			reinnoirePanaLa: null,
		},
		{
			event: "asigurare.schimbare",
			...comun,
			persoana: { id: "p1", nume: "Ion Popescu" },
			statut: "neasigurat",
			areCard: null,
			verificatLa: "2026-10-30T09:00:00.000Z",
		},
		{
			event: "termen.expira",
			...comun,
			termen: { id: "t1", categorie: "personale", tip: "pasaport", eticheta: "Pasaport", al: null, expiraLa: "2026-11-29" },
			zileRamase: 30,
			prag: 30,
		},
	] as const

	it.each(evenimente.map((e) => [e.event, e] as const))("accepta evenimentul %s", (nume, corp) => {
		const n = verificaWebhookNotificare(corp, { "x-acteo-key": "k" }, { cheie: "k" })
		expect(n.event).toBe(nume)
		expect(n.trimisLa).toBeInstanceOf(Date)
	})

	it("datele ISO din evenimentele noi devin Date, cele yyyy-mm-dd raman text", () => {
		const termen = verificaWebhookNotificare(evenimente[1], { "x-acteo-key": "k" }, { cheie: "k" })
		if (termen.event !== "dosar.termen") throw new Error("neasteptat")
		expect(termen.sedinta.data).toBeInstanceOf(Date)
		const marca = verificaWebhookNotificare(evenimente[5], { "x-acteo-key": "k" }, { cheie: "k" })
		if (marca.event !== "marca.expira") throw new Error("neasteptat")
		expect(marca.expiraLa).toBe("2027-01-01")
	})
})

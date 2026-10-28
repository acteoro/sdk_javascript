import { Effect, Either } from "effect"
import { describe, expect, it } from "vitest"
import {
	EroareValidare,
	esteNumarInmatriculareValid,
	esteSerieTalonValida,
	esteVinValid,
	normalizeaza,
	normalizeazaSerieTalon,
} from "../src/index.js"
import { valideazaCerereVerificare, valideazaVehiculNou, type CerereVerificare } from "../src/validare.js"
import { SERIE_TALON, VIN } from "./helpers.js"

const valideaza = (c: CerereVerificare) => Effect.runSync(Effect.either(valideazaCerereVerificare(c)))

describe("numere si VIN", () => {
	it("normalizeaza spatii, cratime si litere mici", () => {
		expect(normalizeaza(" b-123 abc ")).toBe("B123ABC")
	})

	it.each(["B123ABC", "B12ABC", "CJ45XYZ", "IS08BCD", "CD123A", "TC1234AB", "b 123 abc"])("accepta numarul %s", (n) => {
		expect(esteNumarInmatriculareValid(n)).toBe(true)
	})

	it.each(["XX12ABC", "B1ABC", "123", ""])("respinge numarul %s", (n) => {
		expect(esteNumarInmatriculareValid(n)).toBe(false)
	})

	it("respinge VIN-uri cu I, O, Q sau lungime gresita", () => {
		expect(esteVinValid(VIN)).toBe(true)
		expect(esteVinValid("WVWZZZ1JZXW00000I")).toBe(false)
		expect(esteVinValid("WVWZZZ1JZXW0000")).toBe(false)
	})

	it("normalizeaza numarul talonului la litere si cifre mari", () => {
		expect(normalizeazaSerieTalon(" i 00639603-f ")).toBe(SERIE_TALON)
	})

	it.each([SERIE_TALON, "i00639603f", "I 006396 03F", "123456"])("accepta seria de talon %s", (v) => {
		expect(esteSerieTalonValida(v)).toBe(true)
	})

	it.each(["", "ABCDEF", "I0063", "I00639603F1234567890X"])("respinge seria de talon %s", (v) => {
		expect(esteSerieTalonValida(v)).toBe(false)
	})
})

describe("valideazaCerereVerificare", () => {
	it("RCA pe numar: pollingul merge pe numar", () => {
		const r = valideaza({ tip: "rca", query: "b 123 abc" })
		expect(Either.getOrThrow(r)).toMatchObject({ query: "B123ABC", serieSasiu: null, queryPolling: "B123ABC" })
	})

	it("RCA pe numar + VIN: pollingul merge pe VIN, ca in API", () => {
		const r = valideaza({ tip: "rca", query: "B123ABC", serieSasiu: VIN.toLowerCase() })
		expect(Either.getOrThrow(r)).toMatchObject({ query: "B123ABC", serieSasiu: VIN, queryPolling: VIN })
	})

	it("ITP pe numar fara VIN e respins local", () => {
		const r = valideaza({ tip: "itp", query: "B123ABC" })
		expect(Either.isLeft(r)).toBe(true)
		if (Either.isLeft(r)) {
			expect(r.left).toBeInstanceOf(EroareValidare)
			expect(r.left.message).toContain("RAR")
		}
	})

	it("rovinieta cere si VIN", () => {
		const r = valideaza({ tip: "rovinieta", query: "B123ABC", serieTalon: SERIE_TALON })
		expect(Either.isLeft(r) && r.left.camp).toBe("serieSasiu")
	})

	it("rovinieta cere si numarul talonului", () => {
		const r = valideaza({ tip: "rovinieta", query: "B123ABC", serieSasiu: VIN })
		expect(Either.isLeft(r) && r.left.camp).toBe("serieTalon")
		expect(Either.isLeft(r) && r.left.message).toContain("I00639603F")
	})

	it("rovinieta respinge un numar de talon fara forma valida", () => {
		const r = valideaza({ tip: "rovinieta", query: "B123ABC", serieSasiu: VIN, serieTalon: "ABCDEF" })
		expect(Either.isLeft(r) && r.left.camp).toBe("serieTalon")
	})

	it("rovinieta cu numar, VIN si talon: seria e normalizata", () => {
		const r = valideaza({ tip: "rovinieta", query: "B123ABC", serieSasiu: VIN, serieTalon: "i 00639603-f" })
		expect(Either.getOrThrow(r)).toMatchObject({ serieSasiu: VIN, serieTalon: SERIE_TALON, queryPolling: "B123ABC" })
	})

	it("serieTalon e ignorata la celelalte tipuri", () => {
		const r = valideaza({ tip: "rca", query: "B123ABC", serieTalon: "ABCDEF" })
		expect(Either.getOrThrow(r)).toMatchObject({ serieTalon: null })
	})

	it("ARR nu accepta VIN", () => {
		expect(Either.isLeft(valideaza({ tip: "arr", query: VIN }))).toBe(true)
	})

	it("explica exact lungimea gresita a VIN-ului", () => {
		const r = valideaza({ tip: "itp", query: "WVWZZZ1JZXW0000" })
		expect(Either.isLeft(r) && r.left.message).toContain("15 caractere")
	})

	it("tip necunoscut intoarce valorile acceptate", () => {
		const r = valideaza({ tip: "casco" as never, query: "B123ABC" })
		expect(Either.isLeft(r) && r.left.acceptate).toEqual(["rca", "itp", "rovinieta", "arr"])
	})

	it("callbackUrl trebuie sa fie http(s)", () => {
		expect(Either.isLeft(valideaza({ tip: "rca", query: "B123ABC", callbackUrl: "ftp://x.ro" }))).toBe(true)
		expect(Either.isLeft(valideaza({ tip: "rca", query: "B123ABC", callbackUrl: "/relativ" }))).toBe(true)
	})
})

describe("valideazaVehiculNou", () => {
	it("cere cel putin un identificator", () => {
		expect(Either.isLeft(Effect.runSync(Effect.either(valideazaVehiculNou({}))))).toBe(true)
	})

	it("normalizeaza numarul ca in dashboard", () => {
		const r = Effect.runSync(valideazaVehiculNou({ numarInmatriculare: "b-123 abc", serieSasiu: "abc" }))
		expect(r).toEqual({ numarInmatriculare: "B123ABC", serieSasiu: "ABC" })
	})

	it("trimite numarul talonului normalizat", () => {
		const r = Effect.runSync(valideazaVehiculNou({ numarInmatriculare: "B123ABC", serieSasiu: VIN, serieTalon: "i00639603f" }))
		expect(r).toEqual({ numarInmatriculare: "B123ABC", serieSasiu: VIN, serieTalon: SERIE_TALON })
	})

	it("respinge un numar de talon fara forma valida", () => {
		const r = Effect.runSync(Effect.either(valideazaVehiculNou({ numarInmatriculare: "B123ABC", serieTalon: "ABCDEF" })))
		expect(Either.isLeft(r) && r.left.camp).toBe("serieTalon")
	})
})

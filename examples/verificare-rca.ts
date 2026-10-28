// Verificare RCA dupa numar de inmatriculare si VIN, cu asteptarea rezultatului.
// Rulare: ACTEO_API_KEY=... npx tsx examples/verificare-rca.ts
import { Acteo, EroareLimita, EroareValidare } from "../src/index.js"

const acteo = new Acteo()

try {
	const rca = await acteo.auto.rca.verifica({ numar: "B123ABC", vin: "WVWZZZ1JZXW000001" })
	console.log(`RCA ${rca.status}, expira la ${rca.expiresAt?.toLocaleDateString("ro-RO") ?? "-"}`)
	console.log(`Mai ai ${rca.limite?.zi.ramase ?? "?"} verificari azi.`)
} catch (err) {
	if (err instanceof EroareValidare) console.error("Date gresite:", err.message)
	else if (err instanceof EroareLimita) console.error("Cota atinsa:", err.utilizareZi)
	else throw err
}

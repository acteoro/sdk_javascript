/**
 * @acteo/api: clientul oficial Node.js pentru API-ul public Acteo.
 * Verificare RCA, ITP, rovinieta si copie conforma ARR, flota si webhook-uri.
 */

export { Acteo, ClientAuto, ClientDocument, ClientWebhooks } from "./acteo.js"
export type {
	ClientArr,
	ClientItp,
	ClientRca,
	ClientRovinieta,
	IdentificatorRca,
	IdentificatorRovinieta,
	OptiuniPornire,
	OptiuniVerifica,
	RaspunsDocument,
	RezultatDocument,
	VerificareInCursDocument,
} from "./acteo.js"

// Suprafata legacy (`VerificRca`, `.verificari`, `.vehicule`): ramane functionala.
export { VerificRca, ClientVerificari, ClientVehicule, URL_IMPLICIT, URL_IMPLICIT_LEGACY, VERSIUNE_SDK } from "./client.js"
export type { OptiuniClient, OptiuniCerere } from "./client.js"
export type { SetariRetry } from "./internal/http.js"
export type {
	Limite,
	OptiuniAsteptare,
	RaspunsVerificare,
	ReferintaVerificare,
	VerificareFinala,
	VerificareInCurs,
} from "./internal/verificari.js"

export {
	VerificRcaError,
	EroareConfigurare,
	EroareValidare,
	EroareAutentificare,
	EroarePlanInactiv,
	EroareInterzis,
	EroareNegasit,
	EroareConflict,
	EroareLimita,
	EroareServer,
	EroareHttp,
	EroareRetea,
	EroareRaspunsInvalid,
	EroareVerificare,
	EroareTimeoutVerificare,
	EroareWebhook,
} from "./errors.js"
export type { DateEroare, EroareCerere } from "./errors.js"

export type {
	CodRefuzSursa,
	StatusDocument,
	TipVerificare,
	Vehicul,
	WebhookDocumentExpira,
	WebhookNotificare,
	WebhookRezultat,
	WebhookTest,
} from "./schemas.js"

export {
	esteNumarInmatriculareValid,
	esteSerieTalonValida,
	esteVinValid,
	normalizeaza,
	normalizeazaSerieTalon,
	TIPURI_VERIFICARE,
} from "./validare.js"
export type { CerereVerificare, VehiculNou } from "./validare.js"

export {
	parseazaWebhookRezultat,
	verificaWebhookNotificare,
	HEADER_CHEIE_WEBHOOK,
	HEADER_EVENIMENT_WEBHOOK,
} from "./webhooks.js"
export type { HeadereCerere, OptiuniWebhookNotificare } from "./webhooks.js"

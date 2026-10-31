/**
 * @acteo/api: clientul oficial Node.js pentru API-ul public Acteo.
 * Verificare RCA, ITP, rovinieta si copie conforma ARR, flota, decodare VIN,
 * numere disponibile, poze de masini si webhook-uri.
 */

export { Acteo, ClientAuto, ClientDocument, ClientImagini, ClientNumere, ClientVin, ClientWebhooks } from "./acteo.js"
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
export type { DecodareVin, ImagineMasina, NumarDisponibil, OptiuniAsteptareImagine } from "./internal/produse.js"

export {
	VerificRcaError,
	/** Clasa de baza a tuturor erorilor SDK-ului. Acelasi lucru ca `VerificRcaError`. */
	VerificRcaError as ActeoError,
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
	StatusImagine,
	TipVerificare,
	UnghiImagine,
	Vehicul,
	WebhookAsigurareSchimbare,
	WebhookDocumentExpira,
	WebhookDosarEveniment,
	WebhookDosarTermen,
	WebhookFirmaDosar,
	WebhookFirmaSchimbare,
	WebhookMarcaExpira,
	WebhookMarcaSchimbare,
	WebhookNotificare,
	WebhookRezultat,
	WebhookTermenExpira,
	WebhookTest,
} from "./schemas.js"

export {
	esteNumarInmatriculareValid,
	esteSerieTalonValida,
	esteVinValid,
	normalizeaza,
	normalizeazaSerieTalon,
	TIPURI_VERIFICARE,
	UNGHIURI_IMAGINE,
} from "./validare.js"
export type { CerereImagine, CerereVerificare, VehiculNou } from "./validare.js"

export {
	parseazaWebhookRezultat,
	verificaWebhookNotificare,
	HEADER_CHEIE_WEBHOOK,
	HEADER_EVENIMENT_WEBHOOK,
} from "./webhooks.js"
export type { HeadereCerere, OptiuniWebhookNotificare } from "./webhooks.js"

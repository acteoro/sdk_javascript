import { Schema } from "effect"

// Schemele descriu exact ce trimite API-ul. Datele ISO devin obiecte `Date` la
// decodare. Campurile noi adaugate de server sunt ignorate, deci o versiune mai
// veche a SDK-ului nu se strica atunci cand API-ul creste.

/** Tipurile de verificare: RCA (AIDA/BAAR), ITP (RAR), rovinieta (CNAIR), ARR (copie conforma). */
export const TipVerificare = Schema.Literal("rca", "itp", "rovinieta", "arr")
/** Tipul verificarii: `"rca"`, `"itp"`, `"rovinieta"` sau `"arr"`. */
export type TipVerificare = typeof TipVerificare.Type

/**
 * Starea documentului:
 * - `valid`: valabil si departe de expirare;
 * - `warning`: expira curand (RCA 14 zile, ITP 30, rovinieta 7, ARR 14);
 * - `expired`: expirat sau inexistent, confirmat de sursa oficiala;
 * - `not_found`: sursa nu a gasit vehiculul.
 */
export const StatusDocument = Schema.Literal("valid", "warning", "expired", "not_found")
/** Starea documentului: `"valid"`, `"warning"`, `"expired"` sau `"not_found"`. Vezi {@link StatusDocument}. */
export type StatusDocument = typeof StatusDocument.Type

const DataNullabila = Schema.NullOr(Schema.Date)

// ─── Verificari ──────────────────────────────────────────────────────────────

export const RezultatVerificareSchema = Schema.Struct({
	/** Tipul verificarii. */
	tip: TipVerificare,
	/** Identificatorul dupa care s-a cautat (la RCA cu VIN, acesta e VIN-ul). */
	query: Schema.String,
	/** Numarul de inmatriculare verificat, `null` cand cautarea s-a facut doar dupa VIN. */
	numarInmatriculare: Schema.NullOr(Schema.String),
	/** Seria de sasiu (VIN) verificata, `null` cand cautarea s-a facut doar dupa numar. */
	serieSasiu: Schema.NullOr(Schema.String),
	/** Momentul verificarii. */
	checkedAt: Schema.Date,
	/** Starea documentului. Vezi {@link StatusDocument}. */
	status: StatusDocument,
	/** Data expirarii documentului, `null` daca nu exista document valabil. */
	expiresAt: DataNullabila,
	/** ID-ul cererii, prezent doar cand ai trimis `callbackUrl`. Apare si in webhook. */
	requestId: Schema.optional(Schema.String),
	/** Recomandarea API-ului, ex: la RCA cerut doar dupa numar, sa trimiti si VIN-ul. */
	hint: Schema.optional(Schema.String),
})

export const InCursSchema = Schema.Struct({
	tip: TipVerificare,
	query: Schema.String,
	status: Schema.Literal("processing"),
	requestId: Schema.optional(Schema.String),
	queuedAt: Schema.optional(Schema.Date),
	pollUrl: Schema.optional(Schema.String),
	hint: Schema.optional(Schema.String),
})

/**
 * Codurile cu care sursa oficiala refuza datele trimise. O reincercare cu
 * aceleasi date nu ajuta; trebuie corectat campul indicat:
 * - `serie_talon_invalida`: numarul certificatului de inmatriculare (talon);
 * - `vin_invalid`: seria de sasiu;
 * - `numar_invalid`: numarul de inmatriculare.
 *
 * Tipul accepta si alte valori, pentru coduri adaugate ulterior de API.
 */
export type CodRefuzSursa = "serie_talon_invalida" | "vin_invalid" | "numar_invalid" | (string & {})

export const EsuataSchema = Schema.Struct({
	tip: TipVerificare,
	query: Schema.String,
	status: Schema.Literal("error"),
	error: Schema.String,
	/** Doar cand sursa a refuzat datele trimise. Vezi {@link CodRefuzSursa}. */
	cod: Schema.optional(Schema.String),
	hint: Schema.optional(Schema.String),
})

export const RaspunsVerificareSchema = Schema.Union(RezultatVerificareSchema, InCursSchema, EsuataSchema)

// ─── Erori ───────────────────────────────────────────────────────────────────

export const CorpEroareSchema = Schema.Struct({
	error: Schema.String,
	hint: Schema.optional(Schema.String),
	accepted: Schema.optional(Schema.Array(Schema.String)),
	code: Schema.optional(Schema.String),
	limita: Schema.optional(Schema.Number),
	dailyUsage: Schema.optional(Schema.String),
	monthlyUsage: Schema.optional(Schema.String),
})

// ─── Vehicule (flota) ────────────────────────────────────────────────────────

export const VehiculSchema = Schema.Struct({
	/** ID-ul vehiculului in cont, folosit la stergere. */
	id: Schema.String,
	/** Numarul de inmatriculare, `null` daca vehiculul a fost adaugat doar cu VIN. */
	numarInmatriculare: Schema.NullOr(Schema.String),
	/** Seria de sasiu (VIN), `null` daca vehiculul a fost adaugat doar cu numarul. */
	serieSasiu: Schema.NullOr(Schema.String),
	/** Numarul certificatului de inmatriculare (talon). Fara el rovinieta nu se verifica. */
	serieTalon: Schema.optionalWith(Schema.NullOr(Schema.String), { default: () => null }),
	/** Sursa oficiala a respins numarul talonului; rovinieta nu se mai verifica pana la corectarea lui. */
	serieTalonRespinsa: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	/** Data expirarii RCA, `null` daca nu e cunoscuta inca. */
	rcaExpiraLa: DataNullabila,
	/** Data expirarii ITP, `null` daca nu e cunoscuta inca (ITP-ul cere VIN). */
	itpExpiraLa: DataNullabila,
	/** Data expirarii rovinietei, `null` daca nu e cunoscuta inca (rovinieta cere numar, VIN si numarul talonului). */
	rovinietaExpiraLa: DataNullabila,
	/** Data expirarii copiei conforme ARR. Completata doar cand `arrMonitorizat` e `true`. */
	arrExpiraLa: DataNullabila,
	/** Vehiculul e monitorizat si pentru copia conforma ARR (cere un plan activ). */
	arrMonitorizat: Schema.Boolean,
	/** Cand a fost adaugat vehiculul in cont. */
	createdAt: Schema.Date,
	/** Vehiculul e verificat automat si primeste notificari de expirare. */
	activ: Schema.Boolean,
})
/** Un vehicul monitorizat din cont, cu datele de expirare ale documentelor. */
export type Vehicul = typeof VehiculSchema.Type

export const ListaVehiculeSchema = Schema.Struct({ vehicule: Schema.Array(VehiculSchema) })
export const VehiculCreatSchema = Schema.Struct({ vehicul: VehiculSchema })
export const StergereSchema = Schema.Struct({ success: Schema.Literal(true) })

// ─── Webhook-uri ─────────────────────────────────────────────────────────────

/** Rezultatul livrat la `callbackUrl` dupa o verificare. */
export const WebhookRezultatSchema = Schema.Struct({
	/** ID-ul cererii, acelasi cu `requestId` primit de la `porneste()`. */
	requestId: Schema.String,
	/** Tipul verificarii. */
	tip: TipVerificare,
	/** Identificatorul dupa care s-a cautat. */
	query: Schema.String,
	/** Seria de sasiu trimisa in cerere, daca exista. */
	serieSasiu: Schema.NullOr(Schema.String),
	/** Starea documentului sau `"error"` cand sursa oficiala nu a raspuns. */
	status: Schema.Union(StatusDocument, Schema.Literal("error")),
	/** Rezultatul complet, `null` la `status: "error"`. */
	result: Schema.NullOr(RezultatVerificareSchema),
	/** Momentul verificarii, `null` la eroare. */
	checkedAt: DataNullabila,
	/** Mesajul de eroare, doar la `status: "error"`. */
	error: Schema.optional(Schema.String),
})
/** Payloadul POST trimis la `callbackUrl` cand o verificare se termina. */
export type WebhookRezultat = typeof WebhookRezultatSchema.Type

/** Evenimentul `document.expira`: un document a intrat intr-un prag de expirare. */
export const WebhookDocumentExpiraSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("document.expira"),
	/** ID unic al livrarii. Foloseste-l pentru deduplicare. */
	id: Schema.String,
	/** Vehiculul la care expira documentul. */
	vehicul: Schema.Struct({
		/** ID-ul vehiculului in cont, acelasi ca in `vehicule.lista()`. */
		id: Schema.String,
		/** Numarul de inmatriculare, daca e cunoscut. */
		numarInmatriculare: Schema.NullOr(Schema.String),
		/** Seria de sasiu (VIN), daca e cunoscuta. */
		serieSasiu: Schema.NullOr(Schema.String),
	}),
	/** Documentul care expira. */
	document: TipVerificare,
	/** Data expirarii documentului. */
	expiraLa: Schema.Date,
	/** Zile intregi ramase pana la expirare (minim 0). */
	zileRamase: Schema.Number,
	/** Pragul de notificare atins, in zile (RCA/ITP/rovinieta: 30, 14, 3; ARR: 60, 50, 45). */
	prag: Schema.Number,
	/** Cand a fost trimisa notificarea. */
	trimisLa: Schema.Date,
})
/** Notificarea trimisa cand un document intra intr-un prag de expirare. */
export type WebhookDocumentExpira = typeof WebhookDocumentExpiraSchema.Type

/** Evenimentul `webhook.test`, trimis din butonul de test din dashboard. */
export const WebhookTestSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("webhook.test"),
	/** ID unic al testului. */
	id: Schema.String,
	/** Mesajul de confirmare. */
	mesaj: Schema.String,
	/** Cand a fost trimis testul. */
	trimisLa: Schema.Date,
})
/** Evenimentul trimis de butonul de test din dashboard. */
export type WebhookTest = typeof WebhookTestSchema.Type

// Evenimentele celorlalte servicii (add-on-ul Webhook). `id` e unic per livrare
// si ramane acelasi la reincercari.

const DosarWebhook = Schema.Struct({
	/** ID-ul dosarului in cont. */
	id: Schema.String,
	/** Numarul dosarului la instanta, ex: `1234/3/2024`. */
	numar: Schema.String,
	/** Eticheta pusa de tine in cont. */
	eticheta: Schema.NullOr(Schema.String),
})

/** Evenimentul `dosar.eveniment`: noutate intr-un dosar monitorizat. */
export const WebhookDosarEvenimentSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("dosar.eveniment"),
	/** ID unic al livrarii. Foloseste-l pentru deduplicare. */
	id: Schema.String,
	/** Cand a fost trimisa notificarea. */
	trimisLa: Schema.Date,
	/** Dosarul monitorizat. */
	dosar: DosarWebhook,
	/** Ce s-a intamplat in dosar. */
	eveniment: Schema.Struct({
		/**
		 * `termen_nou` (sedinta noua), `solutie`, `cale_atac` (apel, recurs), `stadiu`,
		 * `instanta_noua` sau `incheiat_auto` (180 de zile fara noutati: dosarul nu mai e monitorizat).
		 */
		tip: Schema.Literal("termen_nou", "solutie", "cale_atac", "stadiu", "instanta_noua", "incheiat_auto"),
		/** Textul alertei, ca in email. */
		descriere: Schema.String,
		/** Instanta, cand e cunoscuta. */
		institutie: Schema.NullOr(Schema.String),
	}),
})
/** Noutate intr-un dosar monitorizat. */
export type WebhookDosarEveniment = typeof WebhookDosarEvenimentSchema.Type

/** Evenimentul `dosar.termen`: se apropie o sedinta intr-un dosar monitorizat. */
export const WebhookDosarTermenSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("dosar.termen"),
	/** ID unic al livrarii. Foloseste-l pentru deduplicare. */
	id: Schema.String,
	/** Cand a fost trimisa notificarea. */
	trimisLa: Schema.Date,
	/** Dosarul monitorizat. */
	dosar: DosarWebhook,
	/** Sedinta care se apropie. */
	sedinta: Schema.Struct({
		/** Data sedintei. */
		data: Schema.Date,
		/** Ora sedintei, cand e cunoscuta. */
		ora: Schema.NullOr(Schema.String),
		/** Instanta. */
		institutie: Schema.NullOr(Schema.String),
		/** Completul de judecata. */
		complet: Schema.NullOr(Schema.String),
	}),
	/** Reminder cu 3 zile si cu o zi inainte de sedinta. */
	zileRamase: Schema.Literal(1, 3),
})
/** Se apropie o sedinta intr-un dosar monitorizat. */
export type WebhookDosarTermen = typeof WebhookDosarTermenSchema.Type

const FirmaWebhook = Schema.Struct({
	/** ID-ul firmei in cont. */
	id: Schema.String,
	/** Denumirea firmei. */
	denumire: Schema.String,
})

/** Evenimentul `firma.schimbare`: ANAF a schimbat starea unei firme monitorizate. */
export const WebhookFirmaSchimbareSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("firma.schimbare"),
	/** ID unic al livrarii. Foloseste-l pentru deduplicare. */
	id: Schema.String,
	/** Cand a fost trimisa notificarea. */
	trimisLa: Schema.Date,
	/** Firma monitorizata. */
	firma: FirmaWebhook,
	/** Campurile schimbate. */
	schimbari: Schema.Array(
		Schema.Struct({
			/** Campul schimbat. */
			camp: Schema.Literal(
				"radiata",
				"inactiv",
				"platitor_tva",
				"tva_la_incasare",
				"split_tva",
				"e_factura",
				"denumire",
				"adresa",
				"caen",
			),
			/** Valoarea dinainte (`"da"` / `"nu"` sau textul ANAF); `null` cand nu e cunoscuta. */
			valoareVeche: Schema.NullOr(Schema.String),
			/** Valoarea de acum. */
			valoareNoua: Schema.String,
			/** Data (`yyyy-mm-dd`) de la care se aplica, cand ANAF o da. */
			dataEfect: Schema.NullOr(Schema.String),
		}),
	),
})
/** ANAF a schimbat starea unei firme monitorizate. */
export type WebhookFirmaSchimbare = typeof WebhookFirmaSchimbareSchema.Type

/** Evenimentul `firma.dosar`: dosar nou in instanta pe numele unei firme monitorizate. */
export const WebhookFirmaDosarSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("firma.dosar"),
	/** ID unic al livrarii. Foloseste-l pentru deduplicare. */
	id: Schema.String,
	/** Cand a fost trimisa notificarea. */
	trimisLa: Schema.Date,
	/** Firma monitorizata. */
	firma: FirmaWebhook,
	/** Dosarul nou. */
	dosar: Schema.Struct({
		/** Numarul dosarului. */
		numar: Schema.String,
		/** Instanta. */
		institutie: Schema.String,
		/** Calitatea firmei in dosar. */
		calitateParte: Schema.NullOr(Schema.String),
		/** Obiectul dosarului. */
		obiect: Schema.NullOr(Schema.String),
		/** Categoria de pe portalul instantelor (ex: Faliment). */
		categorie: Schema.NullOr(Schema.String),
		/**
		 * Dosar de insolventa: `debitor` (firma e in procedura), `creditor` (are de
		 * recuperat bani in procedura altcuiva), `alta`; `null` pentru alt fel de dosar.
		 */
		insolventa: Schema.NullOr(Schema.Literal("debitor", "creditor", "alta")),
	}),
})
/** Dosar nou pe numele unei firme monitorizate. */
export type WebhookFirmaDosar = typeof WebhookFirmaDosarSchema.Type

const MarcaWebhook = Schema.Struct({
	/** ID-ul marcii in cont. */
	id: Schema.String,
	/** ID-ul marcii in TMview (oficiul + numarul). */
	st13: Schema.String,
	/** Numele marcii. */
	nume: Schema.String,
	/** `RO` = OSIM, `EM` = EUIPO (marca a Uniunii Europene). */
	oficiu: Schema.Literal("RO", "EM"),
	/** Numarul de depozit. */
	numarDepozit: Schema.String,
})

/** Evenimentul `marca.schimbare`: s-a schimbat ceva la o marca urmarita. */
export const WebhookMarcaSchimbareSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("marca.schimbare"),
	/** ID unic al livrarii. Foloseste-l pentru deduplicare. */
	id: Schema.String,
	/** Cand a fost trimisa notificarea. */
	trimisLa: Schema.Date,
	/** Marca urmarita. */
	marca: MarcaWebhook,
	/** Ce s-a schimbat; `inregistrata` = cererea in curs a devenit marca inregistrata. */
	schimbare: Schema.Literal("inregistrata", "reinnoita", "expirata", "anulata", "respinsa", "retrasa", "opozitie"),
	/** La `reinnoita`: vechea data de expirare (`yyyy-mm-dd`); la `opozitie`: numarul vechi de opozitii; altfel statusul vechi. */
	valoareVeche: Schema.String,
	/** Ca `valoareVeche`, valoarea de acum. */
	valoareNoua: Schema.String,
})
/** S-a schimbat ceva la o marca urmarita (OSIM sau EUIPO). */
export type WebhookMarcaSchimbare = typeof WebhookMarcaSchimbareSchema.Type

/** Evenimentul `marca.expira`: o marca urmarita intra intr-un prag de expirare. */
export const WebhookMarcaExpiraSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("marca.expira"),
	/** ID unic al livrarii. Foloseste-l pentru deduplicare. */
	id: Schema.String,
	/** Cand a fost trimisa notificarea. */
	trimisLa: Schema.Date,
	/** Marca urmarita. */
	marca: MarcaWebhook,
	/** Data expirarii, `yyyy-mm-dd`. */
	expiraLa: Schema.String,
	/** `6l`, `3l`, `1l` (luni), `7z` (zile) inainte; `gratie` = a expirat, se mai poate reinnoi cu taxa. */
	prag: Schema.Literal("6l", "3l", "1l", "7z", "gratie"),
	/** La `gratie`: ultima zi (`yyyy-mm-dd`) in care se mai poate reinnoi; altfel `null`. */
	reinnoirePanaLa: Schema.NullOr(Schema.String),
})
/** O marca urmarita intra intr-un prag de expirare. */
export type WebhookMarcaExpira = typeof WebhookMarcaExpiraSchema.Type

/** Evenimentul `asigurare.schimbare`: s-a schimbat statutul de asigurat la CNAS. */
export const WebhookAsigurareSchimbareSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("asigurare.schimbare"),
	/** ID unic al livrarii. Foloseste-l pentru deduplicare. */
	id: Schema.String,
	/** Cand a fost trimisa notificarea. */
	trimisLa: Schema.Date,
	/** Persoana monitorizata. */
	persoana: Schema.Struct({
		/** ID-ul persoanei in cont. */
		id: Schema.String,
		/** Numele persoanei. */
		nume: Schema.String,
	}),
	/** Statutul de acum. */
	statut: Schema.Literal("asigurat", "neasigurat", "necunoscut"),
	/** Cardul de sanatate e emis; `null` cand CNAS nu spune. */
	areCard: Schema.NullOr(Schema.Boolean),
	/** Cand a fost interogat CNAS. */
	verificatLa: Schema.Date,
})
/** S-a schimbat statutul de asigurat la CNAS al unei persoane monitorizate. */
export type WebhookAsigurareSchimbare = typeof WebhookAsigurareSchimbareSchema.Type

/** Evenimentul `termen.expira`: un termen din cont intra in pragul de 30 sau de 3 zile. */
export const WebhookTermenExpiraSchema = Schema.Struct({
	/** Numele evenimentului. */
	event: Schema.Literal("termen.expira"),
	/** ID unic al livrarii. Foloseste-l pentru deduplicare. */
	id: Schema.String,
	/** Cand a fost trimisa notificarea. */
	trimisLa: Schema.Date,
	/** Termenul din cont. */
	termen: Schema.Struct({
		/** ID-ul termenului in cont. */
		id: Schema.String,
		/** `auto`, `personale`, `sanatate`, `afaceri` sau `casa`. */
		categorie: Schema.String,
		/** Tipul termenului. */
		tip: Schema.String,
		/** Numele termenului, ex: Pasaport sau numele dat de tine. */
		eticheta: Schema.String,
		/** Al cui e termenul: numarul masinii, firma sau persoana. */
		al: Schema.NullOr(Schema.String),
		/** Data scadentei, `yyyy-mm-dd`. */
		expiraLa: Schema.String,
	}),
	/** Zile intregi ramase pana la scadenta. */
	zileRamase: Schema.Number,
	/** Pragul atins, in zile. */
	prag: Schema.Literal(30, 3),
})
/** Un termen adaugat in cont intra in pragul de 30 sau de 3 zile. */
export type WebhookTermenExpira = typeof WebhookTermenExpiraSchema.Type

export const WebhookNotificareSchema = Schema.Union(
	WebhookDocumentExpiraSchema,
	WebhookDosarEvenimentSchema,
	WebhookDosarTermenSchema,
	WebhookFirmaSchimbareSchema,
	WebhookFirmaDosarSchema,
	WebhookMarcaSchimbareSchema,
	WebhookMarcaExpiraSchema,
	WebhookAsigurareSchimbareSchema,
	WebhookTermenExpiraSchema,
	WebhookTestSchema,
)
/** Orice notificare trimisa la URL-ul de webhook al contului. Distinge-le dupa `event`. */
export type WebhookNotificare = typeof WebhookNotificareSchema.Type

// ─── Decodare VIN ────────────────────────────────────────────────────────────

export const DecodareVinSchema = Schema.Struct({
	/** VIN-ul normalizat. */
	vin: Schema.String,
	/** Marca e cunoscuta. */
	gasit: Schema.Boolean,
	/** S-a consumat o cerere din plan: doar cand marca si modelul sunt gasite. */
	taxat: Schema.Boolean,
	/** Marca, cand e gasita. */
	marca: Schema.NullOr(Schema.String),
	/** Modelul, cand e gasit. */
	model: Schema.NullOr(Schema.String),
	/** Anul fabricatiei, cand e cunoscut. */
	anFabricatie: Schema.NullOr(Schema.Number),
	/** De unde vine anul: `pozitia-10` confirmata, startul `generatie` sau `anunturi`. */
	sursaAn: Schema.NullOr(Schema.Literal("pozitia-10", "generatie", "anunturi")),
	/** Modelele posibile, cand sursele nu cad de acord. Mereu gol cand `taxat` e `false`. */
	modelePosibile: Schema.Array(Schema.String),
	/** Structura VIN-ului, calculata doar din cele 17 caractere. */
	structura: Schema.Struct({
		/** Pozitiile 1-3: producatorul. */
		wmi: Schema.String,
		/** Pozitiile 4-9: descrierea vehiculului. */
		vds: Schema.String,
		/** Pozitiile 10-17: exemplarul. */
		vis: Schema.String,
		/** Regiunea producatorului. */
		regiune: Schema.NullOr(Schema.String),
		/** Tara producatorului. */
		tara: Schema.NullOr(Schema.String),
		/** Cifra de control (pozitia 9): `ok`, `gresita` sau `neaplicabila`. */
		cifraControl: Schema.Literal("ok", "gresita", "neaplicabila"),
		/** Cifra de control asteptata, cand se aplica. */
		cifraControlAsteptata: Schema.NullOr(Schema.String),
		/** Anii de fabricatie posibili dupa pozitia 10. */
		aniPosibili: Schema.Array(Schema.Number),
	}),
})
/** Rezultatul decodarii unui VIN. */
export type DecodareVin = typeof DecodareVinSchema.Type

// ─── Numere disponibile ──────────────────────────────────────────────────────

export const NumarDisponibilSchema = Schema.Struct({
	/** Numarul normalizat. */
	numar: Schema.String,
	/** Numarul e liber la DGPCI si poate fi rezervat. */
	disponibil: Schema.Boolean,
	/** Textul intors de DGPCI, cand exista. */
	mesaj: Schema.NullOr(Schema.String),
})
/** Raspunsul DGPCI pentru un numar de inmatriculare. */
export type NumarDisponibil = typeof NumarDisponibilSchema.Type

// ─── Imagini masini ──────────────────────────────────────────────────────────

/** Unghiurile pozei. */
export const UnghiImagine = Schema.Literal(
	"trei-sferturi",
	"fata",
	"profil",
	"spate",
	"trei-sferturi-dreapta",
	"profil-dreapta",
)
/** Unghiul pozei: `"trei-sferturi"` (implicit), `"fata"`, `"profil"`, `"spate"`, `"trei-sferturi-dreapta"`, `"profil-dreapta"`. */
export type UnghiImagine = typeof UnghiImagine.Type

/**
 * Starea pozei:
 * - `gata`: poza masinii cerute (se taxeaza);
 * - `in-lucru`: o randam acum; revino dupa `retryAfterMs`;
 * - `necunoscut`: marca sau modelul nu au fost identificate;
 * - `indisponibil`: randarea a esuat; se reincearca la prima cerere dupa 24h.
 *
 * In afara de `gata`, primesti poza generica (masina sub husa), netaxata.
 */
export const StatusImagine = Schema.Literal("gata", "in-lucru", "necunoscut", "indisponibil")
/** Starea pozei. Vezi {@link StatusImagine}. */
export type StatusImagine = typeof StatusImagine.Type

export const ImagineMasinaSchema = Schema.Struct({
	/** Poza e a masinii cerute; `false` = poza generica (masina sub husa). */
	gata: Schema.Boolean,
	/** Starea pozei. Vezi {@link StatusImagine}. */
	status: StatusImagine,
	/** S-a consumat o cerere din plan: doar cand `status` e `gata`. */
	taxat: Schema.Boolean,
	/** Link semnat spre poza (WebP transparent), valabil pana la `expiraLa`. `null` doar daca nici poza generica nu e disponibila. */
	url: Schema.NullOr(Schema.String),
	/** Cand expira `url`. `null` cand `url` e `null`. */
	expiraLa: DataNullabila,
	/** Unghiul pozei. */
	unghi: UnghiImagine,
	/** Poza are umbra sub masina. */
	umbra: Schema.Boolean,
	/** Latimea pozei, in pixeli. */
	latime: Schema.Number,
	/** Inaltimea pozei, in pixeli. */
	inaltime: Schema.Number,
	/** Marca canonica, sau cea trimisa daca inca nu e cunoscuta. */
	marca: Schema.String,
	/** Modelul canonic, sau cel trimis daca inca nu e cunoscut. */
	model: Schema.String,
	/** Generatia aleasa dupa an; `null` cand nu e aleasa inca. */
	generatie: Schema.NullOr(
		Schema.Struct({
			/** Numele generatiei, ex: `Volkswagen Golf VII`. */
			eticheta: Schema.String,
			/** Primul an al generatiei. */
			anDe: Schema.Number,
			/** Ultimul an; `null` = inca in productie. */
			anPana: Schema.NullOr(Schema.Number),
			/** Caroseria, ex: `5-door hatchback`. */
			caroserie: Schema.String,
		}),
	),
})

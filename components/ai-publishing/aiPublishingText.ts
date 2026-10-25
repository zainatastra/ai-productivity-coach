// components/ai-publishing/aiPublishingText.ts
// German is the default language of the AI Publishing workspace; English is optional.

export type Lang = "de" | "en";
type Pair = { de: string; en: string };

export const TEXT = {
  title: { de: "KI-Publishing", en: "AI Publishing" },
  subtitle: {
    de: "Lösungsanbieter anlegen, Quellen hinterlegen und die Recherche vorbereiten.",
    en: "Create solution providers, add sources and prepare research.",
  },
  createTitle: { de: "Neuen Lösungsanbieter anlegen", en: "Create a new solution provider" },
  providerName: { de: "Name des Lösungsanbieters", en: "Name of solution provider" },
  providerNamePh: { de: "z. B. PROFI Engineering Systems AG", en: "e.g. PROFI Engineering Systems AG" },
  website: { de: "Website des Lösungsanbieters", en: "Website of solution provider" },
  websitePh: { de: "https://www.beispiel.de", en: "https://www.example.com" },
  create: { de: "Erstellen", en: "Create" },
  creating: { de: "Wird erstellt …", en: "Creating …" },
  providers: { de: "Lösungsanbieter", en: "Solution providers" },
  active: { de: "Aktiv", en: "Active" },
  archived: { de: "Archiviert", en: "Archived" },
  noProviders: {
    de: "Noch keine Lösungsanbieter vorhanden. Legen Sie oben den ersten an.",
    en: "No solution providers yet. Create the first one above.",
  },
  noArchived: { de: "Keine archivierten Anbieter.", en: "No archived providers." },
  loading: { de: "Wird geladen …", en: "Loading …" },
  sources: { de: "Quellen", en: "Sources" },
  sourcesAvailable: { de: "verfügbar", en: "available" },
  sourcesUnavailable: { de: "nicht verfügbar", en: "unavailable" },
  notChecked: { de: "Noch nicht geprüft", en: "Not checked yet" },
  open: { de: "Öffnen", en: "Open" },
  back: { de: "Zurück zur Übersicht", en: "Back to overview" },
  archive: { de: "Archivieren", en: "Archive" },
  restore: { de: "Wiederherstellen", en: "Restore" },
  edit: { de: "Bearbeiten", en: "Edit" },
  save: { de: "Speichern", en: "Save" },
  cancel: { de: "Abbrechen", en: "Cancel" },
  createdOn: { de: "Erstellt", en: "Created" },
  sourcesTitle: { de: "Quellen & Links", en: "Sources & links" },
  sourcesHelp: {
    de: "Die KI recherchiert aus diesen Links. Je mehr gute Quellen (Produktseiten, Dokumentation, Fallstudien), desto besser.",
    en: "The AI researches from these links. The more good sources (product pages, documentation, case studies), the better.",
  },
  sourceUrl: { de: "Link hinzufügen", en: "Add link" },
  sourceUrlPh: { de: "https://…", en: "https://…" },
  sourceType: { de: "Art", en: "Type" },
  add: { de: "Hinzufügen", en: "Add" },
  primary: { de: "Hauptwebsite", en: "Main website" },
  remove: { de: "Entfernen", en: "Remove" },
  checkSources: { de: "Quellen prüfen", en: "Check sources" },
  checking: { de: "Prüfung läuft …", en: "Checking …" },
  checkHelp: {
    de: "Prüft, ob alle Links erreichbar sind und lesbaren Text enthalten.",
    en: "Checks that all links are reachable and contain readable text.",
  },
  statusCol: { de: "Status", en: "Status" },
  titleCol: { de: "Seitentitel", en: "Page title" },
  linkCol: { de: "Link", en: "Link" },
  jobs: { de: "Aufträge", en: "Jobs" },
  noJobs: { de: "Noch keine Aufträge.", en: "No jobs yet." },
  retry: { de: "Erneut versuchen", en: "Retry" },
  stop: { de: "Abbrechen", en: "Cancel job" },
  notifications: { de: "Benachrichtigungen", en: "Notifications" },
  noNotifications: { de: "Keine Benachrichtigungen.", en: "No notifications." },
  markAllRead: { de: "Alle als gelesen markieren", en: "Mark all as read" },
  confirmRemove: { de: "Diese Quelle wirklich entfernen?", en: "Remove this source?" },
  confirmArchive: {
    de: "Diesen Anbieter archivieren? Er verschwindet aus der aktiven Liste.",
    en: "Archive this provider? It disappears from the active list.",
  },
  genericError: {
    de: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    en: "Something went wrong. Please try again.",
  },
  networkError: {
    de: "Der Server ist nicht erreichbar. Bitte später erneut versuchen.",
    en: "The server is not reachable. Please try again later.",
  },
  denied: { de: "Kein Zugriff.", en: "Access denied." },

  // ── Phase 2: research + knowledge ──
  research: { de: "Recherche starten", en: "Start research" },
  researching: { de: "Recherche läuft …", en: "Research running …" },
  researchHelp: {
    de: "Die KI liest alle Quellen, baut daraus die Wissensbasis dieses Anbieters auf und bewertet die Wissensbereitschaft.",
    en: "The AI reads all sources, builds this provider's knowledge base from them and rates the knowledge readiness.",
  },
  quickCheck: { de: "Nur Links prüfen", en: "Check links only" },
  knowledgeTitle: { de: "Wissen & Bereitschaft", en: "Knowledge & readiness" },
  noKnowledge: {
    de: "Noch keine Recherche durchgeführt. Starten Sie die Recherche, damit die KI die Quellen liest.",
    en: "No research yet. Start the research so the AI reads the sources.",
  },
  staleKnowledge: {
    de: "Die Quellen wurden geändert. Bitte die Recherche erneut starten, damit das Wissen aktuell ist.",
    en: "The sources were changed. Please start the research again to refresh the knowledge.",
  },
  readinessLabel: { de: "Wissensbereitschaft", en: "Knowledge readiness" },
  readinessReady: { de: "Bereit zur Erstellung.", en: "Ready to generate." },
  readinessPartial: { de: "Eingeschränkt bereit – siehe Empfehlungen.", en: "Partly ready – see recommendations." },
  readinessLow: { de: "Noch zu wenig Wissen für gute Inhalte.", en: "Not enough knowledge for good content yet." },
  pagesRead: { de: "Seiten gelesen", en: "pages read" },
  chunksLabel: { de: "Wissensabschnitte", en: "knowledge chunks" },
  pagesFailed: { de: "nicht lesbar", en: "unreadable" },
  updatedOn: { de: "Stand", en: "Updated" },
  recommendations: { de: "Empfehlungen", en: "Recommendations" },
  generationReadiness: { de: "Bereitschaft für Inhalte", en: "Readiness for content" },
  comingSoon: { de: "Bald verfügbar", en: "Coming soon" },
  profileTitle: { de: "Was die KI gefunden hat", en: "What the AI found" },
  profileNote: {
    de: "KI-Zusammenfassung – nur aus den hinterlegten Quellen, nicht erfunden.",
    en: "AI summary – only from the provided sources, nothing invented.",
  },
  profileMissing: { de: "Keine KI-Zusammenfassung verfügbar.", en: "No AI summary available." },
  profileDescription: { de: "Unternehmensbeschreibung", en: "Company description" },
  profileProducts: { de: "Produkte & Leistungen", en: "Products & services" },
  profileTopics: { de: "Themenschwerpunkte", en: "Key topics" },
  profileIndustries: { de: "Zielbranchen", en: "Target industries" },
  profileContact: { de: "Kontaktdaten laut Quellen", en: "Contact details from sources" },
  profileNoProducts: { de: "Keine Produkte eindeutig erkannt.", en: "No products clearly identified." },
  pagesTitle: { de: "Gelesene Seiten", en: "Pages read" },
  pagesHelp: {
    de: "Diese Seiten bilden die Wissensbasis. Jede Information ist auf ihre Quelle zurückführbar.",
    en: "These pages form the knowledge base. Every piece of information is traceable to its source.",
  },
  showPages: { de: "Seiten anzeigen", en: "Show pages" },
  hidePages: { de: "Seiten ausblenden", en: "Hide pages" },
  noPages: { de: "Noch keine Seiten gelesen.", en: "No pages read yet." },
  pageCol: { de: "Seite", en: "Page" },
  topicCol: { de: "Themen", en: "Topics" },
  sizeCol: { de: "Umfang", en: "Size" },
  chars: { de: "Zeichen", en: "chars" },
  searchTitle: { de: "Wissen testen", en: "Test the knowledge" },
  searchHelp: {
    de: "Stellen Sie eine Frage. Gesucht wird nur in der Wissensbasis dieses Anbieters.",
    en: "Ask a question. Only this provider's knowledge base is searched.",
  },
  searchPh: { de: "z. B. Welche Produkte bietet das Unternehmen an?", en: "e.g. Which products does the company offer?" },
  search: { de: "Suchen", en: "Search" },
  searching: { de: "Suche läuft …", en: "Searching …" },
  noHits: { de: "Keine passenden Inhalte gefunden.", en: "No matching content found." },
  relevance: { de: "Treffer", en: "match" },
  tokensUsed: { de: "KI-Nutzung bisher", en: "AI usage so far" },
  tokens: { de: "Tokens", en: "tokens" },

  // ── Phase 3: content plan + generated drafts ──
  contentTitle: { de: "Inhaltsplan & Inhalte", en: "Content plan & documents" },
  contentHelp: {
    de: "Die KI schlägt je einen Artikel, ein Whitepaper und ein Webinar vor. Sie prüfen und genehmigen den Plan, danach schreibt die KI die Entwürfe aus dem Wissen dieses Anbieters.",
    en: "The AI proposes one article, one whitepaper and one webinar. You review and approve the plan, then the AI writes the drafts from this provider's knowledge.",
  },
  needResearch: {
    de: "Führen Sie zuerst die Recherche durch. Ohne Wissensbasis kann kein Inhaltsplan erstellt werden.",
    en: "Run the research first. A content plan needs the knowledge base.",
  },
  createPlan: { de: "Inhaltsplan erstellen", en: "Create content plan" },
  creatingPlan: { de: "Plan wird erstellt …", en: "Creating plan …" },
  rebuildPlan: { de: "Plan neu erstellen", en: "Rebuild plan" },
  planDraft: { de: "Entwurf – bitte prüfen und genehmigen", en: "Draft – please review and approve" },
  planApproved: { de: "Genehmigt", en: "Approved" },
  approvePlan: { de: "Plan genehmigen", en: "Approve plan" },
  approving: { de: "Wird genehmigt …", en: "Approving …" },
  saveFirst: { de: "Bitte zuerst alle Änderungen speichern.", en: "Please save all changes first." },
  generateContent: { de: "Inhalte erstellen", en: "Write documents" },
  generatingContent: { de: "Inhalte werden erstellt …", en: "Writing documents …" },
  generateAgain: { de: "Alle neu erstellen", en: "Rewrite all" },
  confirmRewriteAll: {
    de: "Alle Dokumente neu erstellen? Es entstehen neue Versionen, die alten bleiben erhalten.",
    en: "Rewrite all documents? New versions are created, the old ones are kept.",
  },
  planFieldTitle: { de: "Titel", en: "Title" },
  planFieldAngle: { de: "Blickwinkel", en: "Angle" },
  planFieldAudience: { de: "Zielgruppe", en: "Audience" },
  planFieldPoints: { de: "Kernpunkte (einer pro Zeile)", en: "Key points (one per line)" },
  planFieldInstruction: { de: "Anweisung an die KI (optional)", en: "Instruction for the AI (optional)" },
  planInstructionPh: { de: "z. B. technischer formulieren, Fokus auf Betrieb …", en: "e.g. more technical, focus on operations …" },
  savePlanItem: { de: "Speichern", en: "Save" },
  saved: { de: "Gespeichert", en: "Saved" },
  suggestAgain: { de: "Neu vorschlagen", en: "Suggest again" },
  suggestWish: { de: "Wunsch (optional)", en: "Wish (optional)" },
  suggestWishPh: { de: "z. B. anderes Thema, mehr Praxisbezug …", en: "e.g. a different topic, more practical …" },
  suggest: { de: "Vorschlagen", en: "Suggest" },
  suggesting: { de: "Wird vorgeschlagen …", en: "Suggesting …" },
  removeItem: { de: "Entfernen", en: "Remove" },
  restoreItem: { de: "Wiederherstellen", en: "Restore" },
  removedItem: { de: "Entfernt – wird nicht erstellt", en: "Removed – will not be written" },
  hasDocument: { de: "Dokument vorhanden", en: "Document exists" },
  tutorialSoonText: {
    de: "Tutorials werden in einer späteren Version aus Produktdokumentation erstellt.",
    en: "Tutorials will be created from product documentation in a later version.",
  },
  docsTitle: { de: "Erstellte Dokumente", en: "Written documents" },
  noDocs: { de: "Noch keine Dokumente erstellt.", en: "No documents written yet." },
  openDoc: { de: "Öffnen", en: "Open" },
  closeDoc: { de: "Zurück zur Übersicht", en: "Back to overview" },
  imagesTitle: { de: "Bilder", en: "Images" },
  imagesHelp: {
    de: "Die KI erstellt ein passendes Titelbild ohne Text und ohne Logos. Es bleibt privat, bis der Inhalt freigegeben wird.",
    en: "The AI creates a matching cover image without text or logos. It stays private until the content is released.",
  },
  imageWish: { de: "Bildwunsch (optional), z. B. „helle Rechenzentrum-Szene“", en: "Image wish (optional), e.g. “bright data centre scene”" },
  generateImage: { de: "Bild erstellen", en: "Create image" },
  imageRunning: { de: "Bild wird erstellt …", en: "Creating image …" },
  noImages: { de: "Noch kein Bild vorhanden.", en: "No image yet." },
  coverBadge: { de: "Titelbild", en: "Cover" },
  makeCover: { de: "Als Titelbild", en: "Use as cover" },
  deleteImage: { de: "Bild löschen", en: "Delete image" },
  imageAlt: { de: "Alternativtext", en: "Alt text" },
  imagePrompt: { de: "Bildbeschreibung der KI", en: "AI image description" },
  imageModelLabel: { de: "Bild-KI", en: "Image AI" },
  words: { de: "Wörter", en: "words" },
  version: { de: "Version", en: "Version" },
  draftBadge: { de: "Entwurf", en: "Draft" },
  privateNote: { de: "Privater Entwurf – nicht veröffentlicht.", en: "Private draft – not published." },
  docSubtitle: { de: "Untertitel", en: "Subtitle" },
  docExcerpt: { de: "Kurzfassung", en: "Excerpt" },
  docSeo: { de: "SEO", en: "SEO" },
  docSeoTitle: { de: "SEO-Titel", en: "SEO title" },
  docMeta: { de: "Meta-Beschreibung", en: "Meta description" },
  docBody: { de: "Text", en: "Text" },
  docNotes: { de: "Hinweise der KI", en: "AI notes" },
  docSources: { de: "Verwendete Quellen", en: "Sources used" },
  sourceUsed: { de: "verwendet", en: "used" },
  sourceAvailable: { de: "bereitgestellt", en: "provided" },
  docQuality: { de: "Qualitätsprüfung", en: "Quality check" },
  docVersions: { de: "Versionen", en: "Versions" },
  rewriteDoc: { de: "Neu erstellen", en: "Rewrite" },
  rewritingDoc: { de: "Wird neu erstellt …", en: "Rewriting …" },
  deleteDoc: { de: "Löschen", en: "Delete" },
  confirmDeleteDoc: {
    de: "Diesen Entwurf mit allen Versionen löschen?",
    en: "Delete this draft with all its versions?",
  },
  approvePlanFirst: {
    de: "Zum Neuerstellen muss der Plan genehmigt sein.",
    en: "The plan must be approved to rewrite.",
  },
  webinarObjectives: { de: "Lernziele", en: "Learning objectives" },
  webinarAudience: { de: "Zielgruppe", en: "Target audience" },
  webinarAgenda: { de: "Agenda", en: "Agenda" },
  webinarDuration: { de: "Dauer", en: "Duration" },
  minutes: { de: "Min.", en: "min." },
  webinarSpeaker: { de: "Referent", en: "Speaker" },
  webinarRegistration: { de: "Anmeldetext", en: "Registration copy" },
  webinarDiscussion: { de: "Diskussionspunkte", en: "Discussion points" },
  webinarBanner: { de: "Bannertext", en: "Banner text" },
  whitepaperCta: { de: "Handlungsaufruf", en: "Call to action" },
  engineLabel: { de: "KI-Modell", en: "AI model" },
  engineFallback: {
    de: "Ersatzmodell aktiv. Für Claude den Schlüssel ANTHROPIC_API_KEY auf dem Server setzen.",
    en: "Fallback model active. To use Claude, set ANTHROPIC_API_KEY on the server.",
  },
  engineMissing: { de: "Keine KI konfiguriert.", en: "No AI configured." },
  qualityOk: { de: "Keine Auffälligkeiten", en: "No issues found" },
  qualityWarnings: { de: "Hinweise", en: "Warnings" },
  qualityIssues: { de: "Probleme", en: "Issues" },
  writtenBy: { de: "Erstellt mit", en: "Written with" },
} satisfies Record<string, Pair>;

export const SOURCE_TYPES: Record<string, Pair> = {
  homepage: { de: "Startseite", en: "Homepage" },
  product: { de: "Produktseite", en: "Product page" },
  documentation: { de: "Dokumentation", en: "Documentation" },
  support: { de: "Support / Hilfe", en: "Support / help" },
  press: { de: "Pressemitteilung", en: "Press release" },
  case_study: { de: "Fallstudie", en: "Case study" },
  event: { de: "Event", en: "Event" },
  article: { de: "Artikel", en: "Article" },
  tutorial: { de: "Tutorial", en: "Tutorial" },
  partner: { de: "Partnerseite", en: "Partner page" },
  other: { de: "Sonstiges", en: "Other" },
};

export const SOURCE_STATUS: Record<string, Pair> = {
  pending: { de: "Ausstehend", en: "Pending" },
  checking: { de: "Wird geprüft", en: "Checking" },
  available: { de: "Verfügbar", en: "Available" },
  unavailable: { de: "Quelle nicht verfügbar", en: "Source unavailable" },
};

export const JOB_STATUS: Record<string, Pair> = {
  queued: { de: "In Warteschlange", en: "Queued" },
  researching: { de: "Recherche läuft", en: "Researching" },
  indexing: { de: "Wissensbasis wird aufgebaut", en: "Indexing" },
  planning: { de: "Inhaltsplan wird erstellt", en: "Planning" },
  generating: { de: "Inhalte werden erstellt", en: "Generating" },
  generating_media: { de: "Medien werden erstellt", en: "Generating media" },
  completed: { de: "Abgeschlossen", en: "Completed" },
  partially_completed: { de: "Teilweise abgeschlossen", en: "Partially completed" },
  failed: { de: "Fehlgeschlagen", en: "Failed" },
  cancelled: { de: "Abgebrochen", en: "Cancelled" },
};

export const JOB_TYPES: Record<string, Pair> = {
  "source.check": { de: "Quellenprüfung", en: "Source check" },
};

// Error codes returned by the backend ({ code, message }).
export const ERRORS: Record<string, Pair> = {
  url_required: { de: "Bitte eine URL eingeben.", en: "Please enter a URL." },
  url_invalid: { de: "Die URL ist ungültig.", en: "The URL is not valid." },
  url_too_long: { de: "Die URL ist zu lang.", en: "The URL is too long." },
  url_scheme: { de: "Nur http:// und https:// sind erlaubt.", en: "Only http:// and https:// are allowed." },
  url_credentials: { de: "URLs mit Benutzername/Passwort sind nicht erlaubt.", en: "URLs with credentials are not allowed." },
  url_port: { de: "Nicht-Standard-Ports sind nicht erlaubt.", en: "Non-standard ports are not allowed." },
  url_ip_not_allowed: { de: "IP-Adressen sind nicht erlaubt. Bitte einen Domainnamen verwenden.", en: "IP addresses are not allowed. Please use a domain name." },
  url_host: { de: "Bitte eine gültige öffentliche Domain eingeben.", en: "Please enter a valid public domain." },
  url_host_blocked: { de: "Diese Domain ist nicht erlaubt.", en: "This domain is not allowed." },
  provider_name_required: { de: "Bitte einen Namen eingeben.", en: "Please enter a name." },
  provider_name_too_long: { de: "Der Name ist zu lang (max. 160 Zeichen).", en: "The name is too long (max. 160 characters)." },
  provider_website_exists: { de: "Für diese Website existiert bereits ein Anbieter.", en: "A provider with this website already exists." },
  provider_not_found: { de: "Anbieter nicht gefunden.", en: "Provider not found." },
  provider_archived: { de: "Archivierte Anbieter können nicht bearbeitet werden.", en: "Archived providers cannot be edited." },
  source_exists: { de: "Dieser Link wurde bereits hinzugefügt.", en: "This link was already added." },
  source_limit: { de: "Maximal 50 Quellen pro Anbieter.", en: "At most 50 sources per provider." },
  source_primary: { de: "Die Hauptwebsite kann nicht entfernt werden.", en: "The main website cannot be removed." },
  source_not_found: { de: "Quelle nicht gefunden.", en: "Source not found." },
  job_not_found: { de: "Auftrag nicht gefunden.", en: "Job not found." },
  job_not_cancellable: { de: "Dieser Auftrag kann nicht abgebrochen werden.", en: "This job cannot be cancelled." },
  job_not_retryable: { de: "Dieser Auftrag kann nicht wiederholt werden.", en: "This job cannot be retried." },
  nothing_to_update: { de: "Keine Änderungen.", en: "No changes." },
};

// Why a single source could not be read (stored on the source as errorCode).
export const SOURCE_ERRORS: Record<string, Pair> = {
  http_error: { de: "Die Seite antwortet mit einem Fehler.", en: "The page returned an error." },
  blocked: { de: "Zugriff blockiert oder Login erforderlich.", en: "Access blocked or login required." },
  not_found: { de: "Seite nicht gefunden (404).", en: "Page not found (404)." },
  timeout: { de: "Zeitüberschreitung beim Laden.", en: "Timed out while loading." },
  dns_error: { de: "Domain nicht auffindbar.", en: "Domain could not be found." },
  connection_failed: { de: "Verbindung fehlgeschlagen.", en: "Connection failed." },
  unsafe_url: { de: "Adresse nicht erlaubt.", en: "Address not allowed." },
  too_many_redirects: { de: "Zu viele Weiterleitungen.", en: "Too many redirects." },
  too_large: { de: "Seite ist zu groß.", en: "Page is too large." },
  unsupported_content: { de: "Inhaltstyp wird nicht unterstützt.", en: "Content type not supported." },
  empty_content: {
    de: "Kaum lesbarer Text (evtl. nur per JavaScript geladen). Bitte alternative Links hinzufügen.",
    en: "Almost no readable text (maybe loaded by JavaScript only). Please add alternative links.",
  },
};

export const tr = (pair: Pair | undefined, lang: Lang, fallback = "") =>
  pair ? pair[lang] : fallback;


export const JOB_TYPES_EXTRA: Record<string, Pair> = {
  research: { de: "Recherche", en: "Research" },
};

export const CATEGORIES: Record<string, Pair> = {
  identity: { de: "Unternehmensidentität", en: "Company identity" },
  description: { de: "Unternehmensbeschreibung", en: "Company description" },
  products: { de: "Produkte & Leistungen", en: "Products & services" },
  documentation: { de: "Software-/Produktdokumentation", en: "Software / product documentation" },
  technical: { de: "Technische Unterlagen", en: "Technical material" },
  case_studies: { de: "Fallstudien & Referenzen", en: "Case studies & references" },
  existing_content: { de: "Vorhandene Inhalte", en: "Existing content" },
  contact: { de: "Kontakt & Unternehmensdaten", en: "Contact & company information" },
  market: { de: "Branchen- & Marktkontext", en: "Industry & market context" },
};

const REC_ADD: Record<string, Pair> = {
  identity: { de: "Fügen Sie eine „Über uns“-Seite hinzu, damit die KI das Unternehmen kennt.", en: "Add an \"About us\" page so the AI knows the company." },
  description: { de: "Es fehlt eine Seite mit Unternehmensbeschreibung (Über uns, Leitbild).", en: "A page describing the company (about us, mission) is missing." },
  products: { de: "Fügen Sie Produkt- oder Leistungsseiten hinzu (mindestens 2).", en: "Add product or service pages (at least 2)." },
  documentation: { de: "Zusätzliche Produktdokumentation wird empfohlen, besonders für Tutorials.", en: "Additional product documentation is recommended, especially for tutorials." },
  technical: { de: "Technische Unterlagen (Technologie, Architektur, Integration) fehlen.", en: "Technical material (technology, architecture, integration) is missing." },
  case_studies: { de: "Fallstudien oder Referenzen würden die Inhalte glaubwürdiger machen.", en: "Case studies or references would make the content more credible." },
  existing_content: { de: "Vorhandene Artikel, News oder Whitepaper als Quelle hinzufügen.", en: "Add existing articles, news or whitepapers as sources." },
  contact: { de: "Eine Kontakt- oder Impressumseite fehlt.", en: "A contact or imprint page is missing." },
  market: { de: "Seiten zu Branchen oder Zielmärkten fehlen.", en: "Pages about industries or target markets are missing." },
};

const REC_MORE: Record<string, Pair> = {
  products: { de: "Weitere Produkt- oder Leistungsseiten hinzufügen (mindestens 2).", en: "Add more product or service pages (at least 2)." },
  documentation: { de: "Weitere Produktdokumentation hinzufügen (mindestens 2 Seiten).", en: "Add more product documentation (at least 2 pages)." },
  technical: { de: "Weitere technische Unterlagen hinzufügen (mindestens 2 Seiten).", en: "Add more technical material (at least 2 pages)." },
};

export const RECOMMENDATIONS: Record<string, Pair> = {
  no_content: {
    de: "Es konnte noch kein lesbarer Inhalt gewonnen werden. Bitte Quellen prüfen oder weitere Links hinzufügen.",
    en: "No readable content could be gathered yet. Please check the sources or add more links.",
  },
  ...Object.fromEntries(Object.entries(REC_ADD).map(([k, v]) => ["add_" + k, v])),
  ...Object.fromEntries(Object.entries(REC_MORE).map(([k, v]) => ["more_" + k, v])),
};

export const GATE_STATES: Record<string, Pair> = {
  ready: { de: "Bereit", en: "Ready" },
  warn: { de: "Mit Warnung", en: "With warning" },
  blocked: { de: "Blockiert", en: "Blocked" },
};

export const GATE_LABELS: Record<string, Pair> = {
  article: { de: "Artikel", en: "Article" },
  whitepaper: { de: "Whitepaper", en: "Whitepaper" },
  webinar: { de: "Webinar", en: "Webinar" },
  tutorial: { de: "Tutorial", en: "Tutorial" },
};

export const GATE_REASONS: Record<string, Pair> = {
  insufficient_knowledge: { de: "zu wenig Wissen", en: "not enough knowledge" },
  low_readiness: { de: "geringe Wissensbereitschaft", en: "low readiness" },
  missing_description: { de: "Unternehmensbeschreibung fehlt", en: "company description missing" },
  tutorial_needs_documentation: { de: "Produktdokumentation fehlt", en: "product documentation missing" },
};

export const EXTRA_ERRORS: Record<string, Pair> = {
  search_query_invalid: { de: "Bitte einen Suchtext mit 2 bis 300 Zeichen eingeben.", en: "Enter a search text of 2 to 300 characters." },
  ai_not_configured: { de: "Die KI ist auf dem Server nicht konfiguriert.", en: "The AI is not configured on the server." },
  ai_unavailable: { de: "Der KI-Dienst ist gerade nicht erreichbar. Bitte später erneut versuchen.", en: "The AI service is not reachable right now. Please try again later." },
};

export const EXTRA_SOURCE_ERRORS: Record<string, Pair> = {
  blocked_by_robots: { de: "Von der Website für Roboter gesperrt (robots.txt).", en: "Blocked for robots by the website (robots.txt)." },
  chunk_limit: { de: "Wissenslimit erreicht – Seite nicht indexiert.", en: "Knowledge limit reached – page not indexed." },
  pdf_not_supported: { de: "PDF wird noch nicht gelesen.", en: "PDFs are not read yet." },
};


export const JOB_TYPES_P3: Record<string, Pair> = {
  "content.generate": { de: "Inhaltserstellung", en: "Content writing" },
  "media.generate": { de: "Bilderstellung", en: "Image creation" },
};

export const CONTENT_TYPES: Record<string, Pair> = {
  article: { de: "Artikel", en: "Article" },
  whitepaper: { de: "Whitepaper", en: "Whitepaper" },
  webinar: { de: "Webinar", en: "Webinar" },
  tutorial: { de: "Tutorial", en: "Tutorial" },
};

export const QUALITY_STATES: Record<string, Pair> = {
  ok: { de: "Keine Auffälligkeiten", en: "No issues found" },
  warnings: { de: "Hinweise", en: "Warnings" },
  issues: { de: "Probleme", en: "Issues" },
};

export const QUALITY_CHECKS: Record<string, Pair> = {
  missing_excerpt: { de: "Es fehlt eine Kurzfassung.", en: "The excerpt is missing." },
  missing_seo: { de: "SEO-Titel oder Meta-Beschreibung fehlen.", en: "SEO title or meta description is missing." },
  too_short: { de: "Der Text ist kürzer als üblich", en: "The text is shorter than usual" },
  too_long: { de: "Der Text ist länger als üblich", en: "The text is longer than usual" },
  few_headings: { de: "Wenige Zwischenüberschriften", en: "Few subheadings" },
  empty_section: { de: "Leerer Abschnitt unter der Überschrift", en: "Empty section under heading" },
  duplicate_paragraph: { de: "Doppelter Absatz", en: "Duplicate paragraph" },
  missing_summary_section: { de: "Es fehlt ein Abschnitt „Zusammenfassung“.", en: "A summary section is missing." },
  missing_conclusion_section: { de: "Es fehlt ein Abschnitt „Fazit“.", en: "A conclusion section is missing." },
  language_mismatch: { de: "Die Sprache passt vermutlich nicht zur gewählten Sprache.", en: "The language probably does not match the selected language." },
  promotional_language: { de: "Werbliche Formulierungen, die nicht aus den Quellen stammen", en: "Promotional wording that is not from the sources" },
  no_sources_used: { de: "Die KI hat keine Quelle als verwendet angegeben.", en: "The AI did not mark any source as used." },
  low_source_coverage: { de: "Wenige Quellen verwendet", en: "Few sources used" },
  unsupported_number: { de: "Zahlen, die in den Quellen nicht vorkommen – bitte prüfen", en: "Numbers not found in the sources – please verify" },
  unsupported_claim: { de: "Aussagen (z. B. Zertifizierung, Partnerschaft), die in den Quellen nicht belegt sind – bitte prüfen", en: "Claims (e.g. certification, partnership) not backed by the sources – please verify" },
  links_present: { de: "Der Text enthält Links.", en: "The text contains links." },
};

export const CONTENT_ERRORS: Record<string, Pair> = {
  storage_not_configured: { de: "Der Medienspeicher ist auf dem Server nicht konfiguriert (VercelMedia:InternalSecret fehlt).", en: "The media storage is not configured on the server (VercelMedia:InternalSecret is missing)." },
  image_not_configured: { de: "Bild-KI oder Medienspeicher sind auf dem Server nicht konfiguriert.", en: "The image AI or media storage is not configured on the server." },
  image_blocked: { de: "Die Bildanfrage wurde von der Sicherheitsprüfung abgelehnt. Bitte anderen Wunsch versuchen.", en: "The image request was declined by the safety check. Please try a different wish." },
  image_unavailable: { de: "Die Bild-KI ist gerade nicht erreichbar.", en: "The image AI is not reachable right now." },
  storage_failed: { de: "Das Bild konnte nicht gespeichert werden.", en: "The image could not be stored." },
  too_many_images: { de: "Der Entwurf hat bereits die maximale Anzahl an Bildern.", en: "The draft already has the maximum number of images." },
  media_not_found: { de: "Das Bild wurde nicht gefunden.", en: "The image was not found." },
  plan_not_found: { de: "Es gibt noch keinen Inhaltsplan.", en: "There is no content plan yet." },
  plan_not_approved: { de: "Der Plan muss zuerst genehmigt werden.", en: "The plan must be approved first." },
  plan_empty: { de: "Mindestens ein Dokument muss im Plan bleiben.", en: "At least one document must stay in the plan." },
  item_not_found: { de: "Thema nicht gefunden.", en: "Topic not found." },
  item_locked: { de: "Dieses Thema kann nicht bearbeitet werden.", en: "This topic cannot be edited." },
  title_too_short: { de: "Der Titel ist zu kurz.", en: "The title is too short." },
  angle_too_short: { de: "Der Blickwinkel ist zu kurz.", en: "The angle is too short." },
  key_points_too_few: { de: "Bitte mindestens zwei Kernpunkte angeben.", en: "Please give at least two key points." },
  nothing_to_generate: { de: "Es gibt nichts mehr zu erstellen.", en: "There is nothing left to write." },
  no_knowledge: { de: "Die Wissensbasis ist leer. Bitte zuerst die Recherche durchführen.", en: "The knowledge base is empty. Please run the research first." },
  ai_refused: { de: "Die KI hat die Anfrage abgelehnt.", en: "The AI declined the request." },
  ai_truncated: { de: "Die KI-Antwort war zu lang.", en: "The AI answer was too long." },
  ai_invalid_output: { de: "Die KI-Ausgabe war unbrauchbar. Bitte erneut versuchen.", en: "The AI output was unusable. Please try again." },
  content_not_found: { de: "Dokument nicht gefunden.", en: "Document not found." },
  content_not_draft: { de: "Nur Entwürfe können gelöscht werden.", en: "Only drafts can be deleted." },
};

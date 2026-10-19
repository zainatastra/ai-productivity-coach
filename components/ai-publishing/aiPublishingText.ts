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

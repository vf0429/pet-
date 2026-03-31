package ezyvet

import "encoding/json"

// ─── Pagination ───────────────────────────────────────────────────────────────

type PagedResponse struct {
	Meta  PageMeta          `json:"meta"`
	Items []json.RawMessage `json:"items"`
}

type PageMeta struct {
	ItemsPage     int `json:"items_page"`
	ItemsPageSize int `json:"items_page_size"`
	ItemsTotal    int `json:"items_total"`
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

type TokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

// ─── Core entities ────────────────────────────────────────────────────────────

type EzContact struct {
	ID        int64  `json:"id"`
	Active    int    `json:"active"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	IsVet     int    `json:"is_vet"`
	IsStaff   int    `json:"is_staff"`
	CreatedAt int64  `json:"created_at"`
}

type EzContactDetail struct {
	ID                  int64  `json:"id"`
	ContactID           int64  `json:"contact_id"`
	ContactDetailTypeID int64  `json:"contactdetailtype_id"`
	Value               string `json:"value"`
	ValueCleaned        string `json:"value_cleaned"`
	Preferred           int    `json:"preferred"`
}

type EzAnimal struct {
	ID             int64   `json:"id"`
	Active         int     `json:"active"`
	Name           string  `json:"name"`
	ContactID      int64   `json:"contact_id"`
	SpeciesID      int64   `json:"species_id"`
	BreedID        int64   `json:"breed_id"`
	SexID          int64   `json:"sex_id"`
	DateOfBirth    int64   `json:"date_of_birth"`
	Weight         float64 `json:"weight"`
	WeightUnit     string  `json:"weight_unit"`
	IsDead         int     `json:"is_dead"`
	Notes          string  `json:"notes"`
	NotesImportant string  `json:"notes_important"`
}

type EzAppointment struct {
	ID                 int64  `json:"id"`
	Active             int    `json:"active"`
	AnimalID           int64  `json:"animal_id"`
	ContactID          int64  `json:"contact_id"`
	ConsultID          int64  `json:"consult_id"`
	StartAt            int64  `json:"start_at"`
	Duration           int64  `json:"duration"` // seconds
	TypeID             int64  `json:"type_id"`
	StatusID           int64  `json:"status_id"`
	Description        string `json:"description"`
	CancellationReason string `json:"cancellation_reason"`
}

type EzConsult struct {
	ID          int64 `json:"id"`
	Active      int   `json:"active"`
	AnimalID    int64 `json:"animal_id"`
	ContactID   int64 `json:"contact_id"`
	ConsultDate int64 `json:"consult_date"`
}

type EzAssessment struct {
	ID        int64  `json:"id"`
	ConsultID int64  `json:"consult_id"`
	Notes     string `json:"notes"`
	Active    int    `json:"active"`
}

type EzPrescription struct {
	ID                   int64 `json:"id"`
	Active               int   `json:"active"`
	ConsultID            int64 `json:"consult_id"`
	AnimalID             int64 `json:"animal_id"`
	PrescribingVetUserID int64 `json:"prescribing_vet_user_id"`
	DateOfPrescription   int64 `json:"date_of_prescription"`
}

type EzPrescriptionItem struct {
	ID             int64   `json:"id"`
	PrescriptionID int64   `json:"prescription_id"`
	ProductID      int64   `json:"product_id"`
	Quantity       float64 `json:"qty"`
	Instructions   string  `json:"instructions"`
	Remaining      int     `json:"remaining"`
	Status         string  `json:"status"`
}

type EzInvoice struct {
	ID        int64 `json:"id"`
	Active    int   `json:"active"`
	AnimalID  int64 `json:"animal_id"`
	ContactID int64 `json:"contact_id"`
	ConsultID int64 `json:"consult_id"`
}

type EzInvoiceLine struct {
	ID        int64   `json:"id"`
	Active    int     `json:"active"`
	InvoiceID int64   `json:"invoice_id"`
	ProductID int64   `json:"product_id"`
	Quantity  float64 `json:"quantity"`
	Price     float64 `json:"price"`
}

type EzProduct struct {
	ID             int64   `json:"id"`
	Active         int     `json:"active"`
	Name           string  `json:"name"`
	Code           string  `json:"code"`
	Type           string  `json:"type"`
	UnitOfMeasure  string  `json:"unit_of_measure"`
	PricePerUnit   float64 `json:"price_per_unit"`
	StockAvailable float64 `json:"stock_available"`
	Barcode        string  `json:"barcode"`
}

type EzStandardOfCare struct {
	ID              int64  `json:"id"`
	Active          int    `json:"active"`
	AnimalID        int64  `json:"animal_id"`
	SocGroupName    string `json:"soc_group_name"`
	SocGroupType    string `json:"soc_group_type"`
	Importance      string `json:"importance"`
	DueAt           int64  `json:"due_at"`
	LastFulfilledAt int64  `json:"last_fulfilled_at"`
}

// ─── Lookup tables ────────────────────────────────────────────────────────────

type EzSpecies struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Active int    `json:"active"`
}

type EzBreed struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	SpeciesID int64  `json:"species_id"`
	Active    int    `json:"active"`
}

type EzSex struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type EzAppointmentType struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type EzAppointmentStatus struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type EzContactDetailType struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

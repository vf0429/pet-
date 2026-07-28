package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"pawrd-merchant-backend/handlers"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupVaccinationSyncTestDB(t *testing.T) (*gorm.DB, string, *models.Tenant, *models.MerchantProject, *models.ClinicIntegrationBinding, *models.MerchantUser) {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	if err := db.AutoMigrate(
		&models.Tenant{},
		&models.TenantRoutingConfig{},
		&models.DatabaseTarget{},
		&models.MerchantUser{},
		&models.MerchantSession{},
		&models.MerchantProject{},
		&models.MerchantAppKey{},
		&models.ClinicIntegrationBinding{},
		&models.ClinicAppointment{},
		&models.ClinicVisit{},
		&models.VaccinationBookingFacade{},
		&models.AppSyncQueue{},
	); err != nil {
		t.Fatalf("Failed to migrate test database: %v", err)
	}

	tenant := models.Tenant{
		Name:   "Happy Paws Clinic",
		Type:   models.TenantTypeClinic,
		Status: models.TenantStatusActive,
	}
	if err := db.Create(&tenant).Error; err != nil {
		t.Fatalf("Failed to create tenant: %v", err)
	}
	mustCreateTenantRoutingConfig(t, db, tenant.ID, models.SubscriptionTierOnboarding, models.TenancyModeSharedRLS, "", "")

	ownerPasswordHash, _ := bcrypt.GenerateFromPassword([]byte("Test123!"), bcrypt.DefaultCost)
	owner := models.MerchantUser{
		TenantID:           tenant.ID,
		Email:              "owner@happypaws.com",
		PasswordHash:       string(ownerPasswordHash),
		Name:               "Clinic Owner",
		Role:               models.UserRoleOwner,
		ActiveBusinessType: models.BusinessTypeClinic,
		CanSwitch:          false,
		Status:             models.UserStatusActive,
	}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatalf("Failed to create owner: %v", err)
	}

	doctorPasswordHash, _ := bcrypt.GenerateFromPassword([]byte("Test123!"), bcrypt.DefaultCost)
	doctor := models.MerchantUser{
		TenantID:           tenant.ID,
		Email:              "doctor@happypaws.com",
		PasswordHash:       string(doctorPasswordHash),
		Name:               "Clinic Doctor",
		Role:               models.UserRoleDoctor,
		ActiveBusinessType: models.BusinessTypeClinic,
		CanSwitch:          false,
		Status:             models.UserStatusActive,
	}
	if err := db.Create(&doctor).Error; err != nil {
		t.Fatalf("Failed to create doctor: %v", err)
	}

	project := models.MerchantProject{
		ProjectCode: "r1-pawrd",
		TenantID:    tenant.ID,
		Name:        "Pawrd Backend",
		BaseURL:     "https://r1.example.com",
		Status:      "active",
	}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("Failed to create merchant project: %v", err)
	}

	rawKey := "r1_consumer_prod_secret123"
	keyHash, _ := bcrypt.GenerateFromPassword([]byte(rawKey), bcrypt.DefaultCost)
	appKey := models.MerchantAppKey{
		ProjectID:   project.ID,
		KeyPrefix:   "r1_consumer_prod",
		KeyHash:     string(keyHash),
		Environment: "prod",
		Status:      "active",
	}
	if err := db.Create(&appKey).Error; err != nil {
		t.Fatalf("Failed to create app key: %v", err)
	}

	binding := models.ClinicIntegrationBinding{
		ProjectID:           project.ID,
		TenantID:            tenant.ID,
		ClinicIntegrationID: "clinic_happy_paws",
		BusinessType:        "clinic",
		DefaultDoctorID:     &doctor.ID,
		Timezone:            "Asia/Hong_Kong",
		Status:              "active",
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatalf("Failed to create integration binding: %v", err)
	}

	return db, rawKey, &tenant, &project, &binding, &owner
}

func setupVaccinationFacadeRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	appV1 := r.Group("/app/v1")
	appV1.Use(middleware.AppKeyAuthMiddleware(db))
	vaccGroup := appV1.Group("/vaccinations")
	{
		vaccGroup.POST("/bookings", handlers.CreateVaccinationBooking(db))
		vaccGroup.POST("/bookings/:external_booking_id/cancel", handlers.CancelVaccinationBooking(db))
	}
	return r
}

func setupAppointmentStatusRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.MerchantAuthMiddleware(db))
	r.PATCH("/merchant/clinic/appointments/:id/status", handlers.UpdateClinicAppointmentStatus(db))
	return r
}

func createVaccinationBookingForTest(t *testing.T, db *gorm.DB, appKey string, clinicIntegrationID string) (models.VaccinationBookingFacade, models.ClinicAppointment) {
	t.Helper()

	router := setupVaccinationFacadeRouter(db)
	scheduledAt := time.Now().Add(24 * time.Hour).UTC().Truncate(time.Second)
	body := map[string]interface{}{
		"clinic_integration_id": clinicIntegrationID,
		"vaccine_code":          "rabies",
		"scheduled_at":          scheduledAt.Format(time.RFC3339),
		"pet": map[string]string{
			"id":   "pet_123",
			"name": "Mochi",
		},
		"owner": map[string]string{
			"name":  "Alice",
			"phone": "91234567",
			"email": "alice@example.com",
		},
		"notes": "Needs booster",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/app/v1/vaccinations/bookings", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Merchant-App-Key", appKey)
	req.Header.Set("Idempotency-Key", "idem-create-1")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var facade models.VaccinationBookingFacade
	if err := db.Order("id DESC").First(&facade).Error; err != nil {
		t.Fatalf("Failed to load facade: %v", err)
	}

	var appointment models.ClinicAppointment
	if err := db.Order("id DESC").First(&appointment).Error; err != nil {
		t.Fatalf("Failed to load appointment: %v", err)
	}

	return facade, appointment
}

func decodeSyncPayload(t *testing.T, payload string) map[string]interface{} {
	t.Helper()
	var decoded map[string]interface{}
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		t.Fatalf("Failed to decode payload: %v", err)
	}
	return decoded
}

func TestCreateVaccinationBooking_EnqueuesSyncForR1Consumer(t *testing.T) {
	db, rawKey, _, project, binding, _ := setupVaccinationSyncTestDB(t)

	facade, appointment := createVaccinationBookingForTest(t, db, rawKey, binding.ClinicIntegrationID)

	if facade.ProjectID != project.ID {
		t.Fatalf("Expected facade project_id %d, got %d", project.ID, facade.ProjectID)
	}
	if facade.Status != "requested" {
		t.Fatalf("Expected facade status requested, got %s", facade.Status)
	}
	if appointment.Status != models.ClinicAppointmentStatusPending {
		t.Fatalf("Expected appointment status pending, got %s", appointment.Status)
	}
	if appointment.Source != "app_facade" {
		t.Fatalf("Expected appointment source app_facade, got %s", appointment.Source)
	}

	var syncEntry models.AppSyncQueue
	if err := db.Order("id DESC").First(&syncEntry).Error; err != nil {
		t.Fatalf("Failed to load sync queue entry: %v", err)
	}

	if syncEntry.EntityType != "appointment" {
		t.Fatalf("Expected sync entity_type appointment, got %s", syncEntry.EntityType)
	}
	if syncEntry.Action != "booking_created" {
		t.Fatalf("Expected sync action booking_created, got %s", syncEntry.Action)
	}

	payload := decodeSyncPayload(t, syncEntry.Payload)
	if payload["external_booking_id"] != facade.ExternalBookingID {
		t.Fatalf("Expected payload external_booking_id %s, got %#v", facade.ExternalBookingID, payload["external_booking_id"])
	}
	if payload["clinic_integration_id"] != binding.ClinicIntegrationID {
		t.Fatalf("Expected payload clinic_integration_id %s, got %#v", binding.ClinicIntegrationID, payload["clinic_integration_id"])
	}
	if payload["to_status"] != "requested" {
		t.Fatalf("Expected payload to_status requested, got %#v", payload["to_status"])
	}
	if uint(payload["project_id"].(float64)) != project.ID {
		t.Fatalf("Expected payload project_id %d, got %#v", project.ID, payload["project_id"])
	}
}

func TestCancelVaccinationBooking_EnqueuesCancellationSyncForR1Consumer(t *testing.T) {
	db, rawKey, _, _, binding, _ := setupVaccinationSyncTestDB(t)

	facade, appointment := createVaccinationBookingForTest(t, db, rawKey, binding.ClinicIntegrationID)
	router := setupVaccinationFacadeRouter(db)

	cancelBody, _ := json.Marshal(map[string]string{"reason": "user requested change"})
	req, _ := http.NewRequest("POST", "/app/v1/vaccinations/bookings/"+facade.ExternalBookingID+"/cancel", bytes.NewBuffer(cancelBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Merchant-App-Key", rawKey)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var updatedFacade models.VaccinationBookingFacade
	if err := db.First(&updatedFacade, facade.ID).Error; err != nil {
		t.Fatalf("Failed to reload facade: %v", err)
	}
	if updatedFacade.Status != "cancelled_by_user" {
		t.Fatalf("Expected facade status cancelled_by_user, got %s", updatedFacade.Status)
	}

	var updatedAppointment models.ClinicAppointment
	if err := db.First(&updatedAppointment, appointment.ID).Error; err != nil {
		t.Fatalf("Failed to reload appointment: %v", err)
	}
	if updatedAppointment.Status != models.ClinicAppointmentStatusCancelled {
		t.Fatalf("Expected appointment status cancelled, got %s", updatedAppointment.Status)
	}

	var syncEntries []models.AppSyncQueue
	if err := db.Order("id ASC").Find(&syncEntries).Error; err != nil {
		t.Fatalf("Failed to load sync queue entries: %v", err)
	}
	if len(syncEntries) != 2 {
		t.Fatalf("Expected 2 sync entries, got %d", len(syncEntries))
	}
	if syncEntries[1].Action != "booking_cancelled" {
		t.Fatalf("Expected second sync action booking_cancelled, got %s", syncEntries[1].Action)
	}

	payload := decodeSyncPayload(t, syncEntries[1].Payload)
	if payload["external_booking_id"] != facade.ExternalBookingID {
		t.Fatalf("Expected cancellation payload external_booking_id %s, got %#v", facade.ExternalBookingID, payload["external_booking_id"])
	}
	if payload["from_status"] != "requested" || payload["to_status"] != "cancelled_by_user" {
		t.Fatalf("Expected cancellation payload requested -> cancelled_by_user, got %#v -> %#v", payload["from_status"], payload["to_status"])
	}
}

func TestUpdateClinicAppointmentStatus_EnqueuesCorrelatedSyncPayload(t *testing.T) {
	db, _, tenant, project, binding, owner := setupVaccinationSyncTestDB(t)

	appointment := models.ClinicAppointment{
		TenantID:      tenant.ID,
		BusinessType:  "clinic",
		PetName:       "Mochi",
		PetOwnerName:  "Alice",
		PetOwnerPhone: "91234567",
		DoctorID:      *binding.DefaultDoctorID,
		VisitType:     "vaccination",
		ScheduledAt:   time.Now().Add(24 * time.Hour).UTC(),
		Status:        models.ClinicAppointmentStatusPending,
		Source:        "app_facade",
	}
	if err := db.Create(&appointment).Error; err != nil {
		t.Fatalf("Failed to create appointment: %v", err)
	}

	facade := models.VaccinationBookingFacade{
		ProjectID:             project.ID,
		TenantID:              tenant.ID,
		ClinicIntegrationID:   binding.ClinicIntegrationID,
		ExternalBookingID:     "vbk_status_001",
		IdempotencyKey:        "idem-status-1",
		InternalAppointmentID: &appointment.ID,
		PetID:                 "pet_123",
		PetName:               "Mochi",
		OwnerName:             "Alice",
		OwnerPhone:            "91234567",
		VaccineCode:           "rabies",
		ScheduledAt:           appointment.ScheduledAt,
		Status:                "requested",
	}
	if err := db.Create(&facade).Error; err != nil {
		t.Fatalf("Failed to create facade: %v", err)
	}

	session := createTestSession(db, owner.ID, tenant.ID)
	router := setupAppointmentStatusRouter(db)

	body, _ := json.Marshal(map[string]string{"target_status": "confirmed"})
	req, _ := http.NewRequest("PATCH", fmt.Sprintf("/merchant/clinic/appointments/%d/status", appointment.ID), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Session-ID", session.ID)
	req.Header.Set("X-Business-Type", "clinic")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var syncEntry models.AppSyncQueue
	if err := db.Order("id DESC").First(&syncEntry).Error; err != nil {
		t.Fatalf("Failed to load sync queue entry: %v", err)
	}
	if syncEntry.Action != "status_changed" {
		t.Fatalf("Expected sync action status_changed, got %s", syncEntry.Action)
	}

	payload := decodeSyncPayload(t, syncEntry.Payload)
	if payload["external_booking_id"] != facade.ExternalBookingID {
		t.Fatalf("Expected payload external_booking_id %s, got %#v", facade.ExternalBookingID, payload["external_booking_id"])
	}
	if payload["from_status"] != "pending" || payload["to_status"] != "confirmed" {
		t.Fatalf("Expected payload pending -> confirmed, got %#v -> %#v", payload["from_status"], payload["to_status"])
	}

	var updatedFacade models.VaccinationBookingFacade
	if err := db.First(&updatedFacade, facade.ID).Error; err != nil {
		t.Fatalf("Failed to reload facade: %v", err)
	}
	if updatedFacade.Status != "confirmed" {
		t.Fatalf("Expected facade status confirmed, got %s", updatedFacade.Status)
	}
}

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"os"
	"pawrd-merchant-backend/handlers"
	"pawrd-merchant-backend/jobs"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/migrations"
	"pawrd-merchant-backend/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func shouldSeedDemoData(databaseURL, allowDemoSeed string) bool {
	if strings.EqualFold(strings.TrimSpace(allowDemoSeed), "true") {
		return true
	}
	return strings.TrimSpace(databaseURL) == ""
}

func demoSeedEnabledFromEnv() bool {
	return shouldSeedDemoData(os.Getenv("DATABASE_URL"), os.Getenv("ALLOW_DEMO_SEED"))
}

func main() {
	// Initialize database
	// Use DATABASE_URL env var for PostgreSQL in production; fallback to SQLite for local dev
	var db *gorm.DB
	var err error
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		log.Println("Using PostgreSQL database")
	} else {
		db, err = gorm.Open(sqlite.Open("pawrd.db"), &gorm.Config{})
		log.Println("DATABASE_URL not set, using SQLite (dev mode)")
	}
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto migrate models
	if err := db.AutoMigrate(
		&models.Tenant{},
		&models.TenantRoutingConfig{},
		&models.DatabaseTarget{},
		&models.MerchantUser{},
		&models.MerchantSession{},
		&models.ShopProduct{},
		&models.ShopOrder{},
		&models.ShopOrderItem{},
		&models.ShopOrderStatusLog{},
		&models.AppSyncQueue{},
		&models.ClinicAppointment{},
		&models.ClinicVisit{},
		&models.ClinicDiagnosis{},
		&models.ClinicPrescription{},
		&models.ClinicFollowup{},
		&models.PharmacyItem{},
		&models.ClinicVisitFile{},
		&models.ClinicTreatment{},
		&models.InsuranceClaim{},
		&models.InsuranceClaimFile{},
		&models.MerchantProject{},
		&models.MerchantAppKey{},
		&models.ClinicIntegrationBinding{},
		&models.ClinicScheduleTemplate{},
		&models.VaccinationBookingFacade{},
		&models.AnimalSpecies{},
		&models.AnimalBreed{},
		&models.ClinicClient{},
		&models.ClinicPatient{},
		&models.HealthReminder{},
		&models.ClinicInvoice{},
		&models.DoctorShift{},
	); err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	if err := migrations.RunAnalyticsIndexMigration(db); err != nil {
		log.Fatal("Failed to run analytics index migration:", err)
	}

	// Seed local/demo data only when explicitly allowed.
	if demoSeedEnabledFromEnv() {
		seedData(db)
		seedClinicScheduleTemplates(db)
	} else {
		log.Println("ALLOW_DEMO_SEED not enabled; skipping demo seed data for hosted database")
	}

	// Setup Gin router
	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

	// API group /v1/merchant
	merchant := r.Group("/v1/merchant")

	// Auth routes (no authentication required)
	auth := merchant.Group("/auth")
	{
		auth.POST("/login", handlers.Login(db))
	}

	// Protected routes (authentication required)
	protected := merchant.Group("")
	protected.Use(middleware.MerchantAuthMiddleware(db))
	protected.Use(middleware.TenantScopedDBMiddleware(db))
	{
		protected.GET("/me", handlers.GetMe(db))
		protected.PATCH("/me/switch", handlers.SwitchBusiness(db))

		// Shop routes
		protected.GET("/shop/stats", handlers.GetShopStats(db))
		protected.GET("/shop/orders", handlers.ListShopOrders(db))
		protected.GET("/shop/orders/:id", handlers.GetShopOrderDetail(db))
		protected.PATCH("/shop/orders/:id/status", handlers.UpdateShopOrderStatus(db))
		protected.GET("/shop/products", handlers.ListShopProducts(db))
		protected.GET("/shop/inventory/alerts", handlers.ListInventoryAlerts(db))

		// Clinic routes
		clinicGroup := protected.Group("/clinic")
		{
			// Read-only endpoints — all clinic roles may access
			clinicReadRoles := middleware.RequireRoles(
				models.UserRoleOwner, models.UserRoleManager,
				models.UserRoleDoctor, models.UserRoleFrontdesk,
			)
			clinicGroup.GET("/stats", clinicReadRoles, handlers.GetClinicStats(db))
			clinicGroup.GET("/appointments", clinicReadRoles, handlers.ListClinicAppointments(db))

			// Clients
			clinicGroup.GET("/clients", clinicReadRoles, handlers.ListClinicClients(db))
			clinicGroup.GET("/clients/:id", clinicReadRoles, handlers.GetClinicClientDetail(db))

			// Patients
			clinicGroup.GET("/patients", clinicReadRoles, handlers.ListClinicPatients(db))
			clinicGroup.GET("/patients/:id", clinicReadRoles, handlers.GetClinicPatientDetail(db))

			// Health Reminders (GET — read-only; PATCH registered below after visitWriteRoles)
			clinicGroup.GET("/reminders", clinicReadRoles, handlers.ListClinicReminders(db))

			// Doctors list (for create appointment form)
			clinicGroup.GET("/doctors", clinicReadRoles, handlers.ListClinicDoctors(db))

			// Availability — returns per-slot availability for a doctor on a date
			clinicGroup.GET("/availability", clinicReadRoles, handlers.GetDoctorAvailability(db))

			// Weekly schedule grid
			clinicGroup.GET("/schedule", clinicReadRoles, handlers.GetWeeklySchedule(db))

			// Clinic operating hours (schedule templates)
			clinicGroup.GET("/schedule-templates", clinicReadRoles, handlers.GetScheduleTemplates(db))

			// Appointments create
			clinicGroup.POST("/appointments", clinicReadRoles, handlers.CreateClinicAppointment(db))

			// Appointment status update — role-restricted inside handler
			// (Owner/Manager: all; Frontdesk: confirm/check-in/cancel; Doctor: in_progress/completed)
			clinicGroup.PATCH("/appointments/:id/status",
				middleware.RequireAppointmentStatusRole(),
				handlers.UpdateClinicAppointmentStatus(db))

			// Visit read — Owner/Manager/Doctor/Frontdesk (Frontdesk needs to see status)
			clinicGroup.GET("/visits/:id", clinicReadRoles, handlers.GetClinicVisit(db))

			// Doctor shift management — Owner/Manager only
			scheduleWriteRoles := middleware.RequireRoles(models.UserRoleOwner, models.UserRoleManager)
			clinicGroup.PUT("/doctor-shifts", scheduleWriteRoles, handlers.UpsertDoctorShift(db))
			clinicGroup.DELETE("/doctor-shifts/:id", scheduleWriteRoles, handlers.DeleteDoctorShift(db))
			clinicGroup.PUT("/schedule-templates/:day", scheduleWriteRoles, handlers.UpdateScheduleTemplate(db))

			// Visit write (clinical content + status) — Owner/Manager/Doctor only
			visitWriteRoles := middleware.RequireRoles(
				models.UserRoleOwner, models.UserRoleManager, models.UserRoleDoctor,
			)
			clinicGroup.PATCH("/visits/:id", visitWriteRoles, handlers.UpdateClinicVisit(db))
			clinicGroup.POST("/visits/:id/push-to-app", visitWriteRoles, handlers.PushVisitToApp(db))
			clinicGroup.POST("/visits/:id/files", visitWriteRoles, handlers.UploadVisitFile(db))

			// Followups — Owner/Manager/Doctor
			clinicGroup.GET("/followups", visitWriteRoles, handlers.ListClinicFollowups(db))
			clinicGroup.POST("/followups", visitWriteRoles, handlers.CreateClinicFollowup(db))
			clinicGroup.PATCH("/followups/:id/status", visitWriteRoles, handlers.UpdateClinicFollowupStatus(db))

			// Health Reminders — fulfill (write) + create
			clinicGroup.PATCH("/reminders/:id", visitWriteRoles, handlers.FulfillClinicReminder(db))
			clinicGroup.POST("/reminders", visitWriteRoles, handlers.CreateClinicReminder(db))

			// Patients create
			clinicGroup.POST("/patients", visitWriteRoles, handlers.CreateClinicPatient(db))

			// Pharmacy — Owner/Manager/Doctor
			clinicGroup.GET("/pharmacy", visitWriteRoles, handlers.ListPharmacyItems(db))
			clinicGroup.PATCH("/pharmacy/:id/dispense", visitWriteRoles, handlers.DispensePharmacyItem(db))

			// Insurance routes — Owner/Manager only
			insuranceRoles := middleware.RequireRoles(
				models.UserRoleOwner, models.UserRoleManager,
			)
			insuranceGroup := clinicGroup.Group("/insurance")
			{
				insuranceGroup.GET("/coverage-preview", insuranceRoles, handlers.GetCoveragePreview(db))
				insuranceGroup.GET("/claims", insuranceRoles, handlers.ListInsuranceClaims(db))
				insuranceGroup.POST("/claims", insuranceRoles, handlers.CreateInsuranceClaim(db))
				insuranceGroup.POST("/claims/:id/files", insuranceRoles, handlers.UploadClaimFile(db))
			}
		}

		// Sync routes — app sync queue status and pending tasks
		protected.GET("/pending-tasks", handlers.GetPendingTasks(db))
		protected.GET("/sync/status", handlers.GetSyncStatus(db))
		protected.GET("/analytics/shop", handlers.GetShopAnalytics(db))
		protected.GET("/analytics/clinic", handlers.GetClinicAnalytics(db))
	}

	// App-facing Facade — consumer App only (app-key auth, NOT merchant session)
	appV1 := r.Group("/app/v1")
	appV1.Use(middleware.AppKeyAuthMiddleware(db))
	appV1.Use(middleware.TenantScopedDBMiddleware(db))
	{
		vaccGroup := appV1.Group("/vaccinations")
		{
			vaccGroup.GET("/availability", handlers.GetVaccinationAvailability(db))
			vaccGroup.POST("/bookings", handlers.CreateVaccinationBooking(db))
			vaccGroup.GET("/bookings/:external_booking_id", handlers.GetVaccinationBooking(db))
			vaccGroup.POST("/bookings/:external_booking_id/cancel", handlers.CancelVaccinationBooking(db))
		}
	}

	port := os.Getenv("PORT")
	if strings.TrimSpace(port) == "" {
		port = "8080"
	}

	log.Printf("Server starting on :%s", port)
	jobs.StartSyncConsumer(db, 30*time.Second)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func seedData(db *gorm.DB) {
	// Check if data already exists
	var count int64
	db.Model(&models.Tenant{}).Count(&count)
	if count > 0 {
		ensureExistingTenantRoutingConfigs(db)
		// Still run shop seed if tenants exist but shop data doesn't
		seedShopData(db)
		seedClinicData(db)
		seedPhase4AData(db)
		seedClinicPatientsAndClients(db)
		return
	}

	// Create Tenant 1: Happy Paws (type=both, status=active)
	tenant1 := models.Tenant{
		Name:   "Happy Paws",
		Type:   models.TenantTypeBoth,
		Status: models.TenantStatusActive,
	}
	db.Create(&tenant1)
	ensureSeedTenantRoutingConfig(db, tenant1.ID, models.SubscriptionTierOnboarding, models.TenancyModeSharedRLS, "", "")

	// Create users for Tenant 1
	passwordHash, _ := bcrypt.GenerateFromPassword([]byte("Test123!"), bcrypt.DefaultCost)

	users1 := []models.MerchantUser{
		{
			TenantID:           tenant1.ID,
			Email:              "owner@happypaws.com",
			PasswordHash:       string(passwordHash),
			Name:               "Happy Paws Owner",
			Role:               models.UserRoleOwner,
			ActiveBusinessType: models.BusinessTypeShop,
			CanSwitch:          true,
			Status:             models.UserStatusActive,
		},
		{
			TenantID:           tenant1.ID,
			Email:              "shop@happypaws.com",
			PasswordHash:       string(passwordHash),
			Name:               "Happy Paws Staff",
			Role:               models.UserRoleStaff,
			ActiveBusinessType: models.BusinessTypeShop,
			CanSwitch:          false,
			Status:             models.UserStatusActive,
		},
		{
			TenantID:           tenant1.ID,
			Email:              "vet@happypaws.com",
			PasswordHash:       string(passwordHash),
			Name:               "Happy Paws Vet",
			Role:               models.UserRoleDoctor,
			ActiveBusinessType: models.BusinessTypeClinic,
			CanSwitch:          false,
			Status:             models.UserStatusActive,
		},
	}
	for _, u := range users1 {
		db.Create(&u)
	}

	// Create Tenant 2: Paws Clinic (type=clinic, status=active)
	tenant2 := models.Tenant{
		Name:   "Paws Clinic",
		Type:   models.TenantTypeClinic,
		Status: models.TenantStatusActive,
	}
	db.Create(&tenant2)
	ensureSeedTenantRoutingConfig(db, tenant2.ID, models.SubscriptionTierOnboarding, models.TenancyModeSharedRLS, "", "")

	// Create users for Tenant 2
	users2 := []models.MerchantUser{
		{
			TenantID:           tenant2.ID,
			Email:              "admin@pawsclinic.com",
			PasswordHash:       string(passwordHash),
			Name:               "Paws Clinic Manager",
			Role:               models.UserRoleManager,
			ActiveBusinessType: models.BusinessTypeClinic,
			CanSwitch:          false,
			Status:             models.UserStatusActive,
		},
	}
	for _, u := range users2 {
		db.Create(&u)
	}

	log.Println("Seed data created successfully")

	// Seed shop data
	seedShopData(db)

	// Seed clinic data
	seedClinicData(db)

	// Seed Phase 4A data
	seedPhase4AData(db)
}

func seedShopData(db *gorm.DB) {
	// Only seed for shop-capable tenants (type=both or type=shop)
	var shopTenants []models.Tenant
	db.Where("type IN ?", []models.TenantType{models.TenantTypeBoth, models.TenantTypeShop}).Find(&shopTenants)
	if len(shopTenants) == 0 {
		return
	}

	// Check if shop_products already seeded
	var productCount int64
	db.Model(&models.ShopProduct{}).Count(&productCount)
	if productCount > 0 {
		return // Already seeded
	}

	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	// Product categories and template data
	type productTemplate struct {
		sku       string
		name      string
		category  string
		price     float64
		stock     int
		threshold int
		active    bool
		imageURL  string
	}

	productTemplates := []productTemplate{
		{"DOG-FOOD-001", "Royal Canin Mini Adult", "food", 120.0, 3, 5, true, "https://cdn.petwell.test/products/royal-canin.jpg"},
		{"DOG-FOOD-002", "Hill's Science Diet Adult", "food", 135.0, 10, 5, true, "https://cdn.petwell.test/products/hills-dog.jpg"},
		{"CAT-FOOD-001", "Blue Buffalo Indoor Cat", "food", 98.0, 2, 4, true, "https://cdn.petwell.test/products/blue-buffalo.jpg"},
		{"CAT-FOOD-002", "Purina Pro Plan Cat", "food", 115.0, 8, 5, true, "https://cdn.petwell.test/products/purina.jpg"},
		{"SUP-001", "Nutrabay Omega-3 Fish Oil", "supplement", 89.0, 1, 3, true, "https://cdn.petwell.test/products/omega3.jpg"},
		{"SUP-002", "VetriScience Multivitamin", "supplement", 75.0, 6, 4, true, "https://cdn.petwell.test/products/vitamins.jpg"},
		{"TOY-001", "Kong Classic Dog Toy", "toy", 45.0, 12, 3, true, "https://cdn.petwell.test/products/kong.jpg"},
		{"TOY-002", "Cat Feather Wand", "toy", 35.0, 5, 3, true, "https://cdn.petwell.test/products/feather-wand.jpg"},
		{"ACC-001", "PetSafe Easy Walk Harness", "accessory", 199.0, 4, 3, true, "https://cdn.petwell.test/products/harness.jpg"},
		{"ACC-002", "Large Pet Carrier", "accessory", 280.0, 2, 2, true, "https://cdn.petwell.test/products/carrier.jpg"},
	}

	// Order status distribution: pending 2, paid 4, preparing 4, shipped 4, completed 4, cancelled 2
	statusDistribution := []models.ShopOrderStatus{
		models.ShopOrderStatusPending, models.ShopOrderStatusPending,
		models.ShopOrderStatusPaid, models.ShopOrderStatusPaid, models.ShopOrderStatusPaid, models.ShopOrderStatusPaid,
		models.ShopOrderStatusPreparing, models.ShopOrderStatusPreparing, models.ShopOrderStatusPreparing, models.ShopOrderStatusPreparing,
		models.ShopOrderStatusShipped, models.ShopOrderStatusShipped, models.ShopOrderStatusShipped, models.ShopOrderStatusShipped,
		models.ShopOrderStatusCompleted, models.ShopOrderStatusCompleted, models.ShopOrderStatusCompleted, models.ShopOrderStatusCompleted,
		models.ShopOrderStatusCancelled, models.ShopOrderStatusCancelled,
	}

	customerNames := []string{"Chan Tai Man", "Li Siu Ming", "Wong Ah Kuen", "Lam Ching Wan", "Ng Fai"}
	customerPhones := []string{"+85291234567", "+85292345678", "+85293456789", "+85294567890", "+85295678901"}
	petNames := []string{"Mochi", "Coco", "Max", "Bella", "Charlie"}
	notes := []string{"", "Leave at reception", "Call before delivery", "Please ring doorbell"}

	for _, tenant := range shopTenants {
		// Create products
		productMap := make(map[string]models.ShopProduct)
		for i, tpl := range productTemplates {
			product := models.ShopProduct{
				TenantID:          tenant.ID,
				BusinessType:      string(models.BusinessTypeShop),
				SKU:               tpl.sku,
				Name:              tpl.name,
				Category:          tpl.category,
				Price:             tpl.price,
				StockLevel:        tpl.stock,
				LowStockThreshold: tpl.threshold,
				IsActive:          tpl.active,
				ImageURL:          tpl.imageURL,
				CreatedAt:         time.Now().Add(-time.Duration(30-i) * 24 * time.Hour),
				UpdatedAt:         time.Now().Add(-time.Duration(15-i) * 24 * time.Hour),
			}
			db.Create(&product)
			productMap[tpl.sku] = product
		}

		// Create 20 orders
		now := time.Now()
		for i := 0; i < 20; i++ {
			status := statusDistribution[i]
			statusIdx := i

			// Time distribution: last 14 days, at least 5 in last 1 day
			var createdAt time.Time
			if i < 5 {
				// Recent: within last 24 hours
				createdAt = now.Add(-time.Duration(r.Intn(24)) * time.Hour)
			} else {
				// Spread over last 14 days
				createdAt = now.Add(-time.Duration(24+r.Intn(336)) * time.Hour)
			}

			customerName := customerNames[r.Intn(len(customerNames))]
			customerPhone := customerPhones[r.Intn(len(customerPhones))]
			petName := petNames[r.Intn(len(petNames))]
			note := notes[r.Intn(len(notes))]

			// Build order items (2-3 per order)
			numItems := 2 + r.Intn(2)
			var itemsSummary string
			var subtotal float64
			selectedProducts := make([]models.ShopProduct, 0, numItems)
			for sku, prod := range productMap {
				if len(selectedProducts) >= numItems {
					break
				}
				if r.Intn(2) == 0 {
					selectedProducts = append(selectedProducts, prod)
					if itemsSummary != "" {
						itemsSummary += ", "
					}
					itemsSummary += fmt.Sprintf("%s x%d", prod.Name, 1+r.Intn(2))
					subtotal += prod.Price * float64(1+r.Intn(2))
				}
				_ = sku // avoid unused
			}
			if len(selectedProducts) == 0 {
				// Fallback: pick random products
				for _, prod := range productMap {
					if len(selectedProducts) >= numItems {
						break
					}
					selectedProducts = append(selectedProducts, prod)
					subtotal += prod.Price
				}
			}

			deliveryFee := 20.0
			totalAmount := subtotal + deliveryFee

			// Determine tracking/cancel based on status
			var trackingNumber, cancelReason string
			if status == models.ShopOrderStatusShipped {
				trackingNumber = fmt.Sprintf("SF%d%d%d%d", r.Intn(10), r.Intn(10), r.Intn(10), r.Intn(10)) + "HK"
			}
			if status == models.ShopOrderStatusCancelled {
				cancelReason = "customer_requested"
			}

			orderNo := fmt.Sprintf("#%d%d%d", tenant.ID, statusIdx+1, 1000+r.Intn(9000))

			order := models.ShopOrder{
				TenantID:       tenant.ID,
				BusinessType:   string(models.BusinessTypeShop),
				OrderNo:        orderNo,
				CustomerName:   customerName,
				CustomerPhone:  customerPhone,
				PetName:        petName,
				ItemsSummary:   itemsSummary,
				SubtotalAmount: subtotal,
				DeliveryFee:    deliveryFee,
				TotalAmount:    totalAmount,
				Currency:       "HKD",
				Status:         status,
				CancelReason:   cancelReason,
				TrackingNumber: trackingNumber,
				Notes:          note,
				CreatedAt:      createdAt,
				UpdatedAt:      createdAt.Add(time.Duration(r.Intn(60)) * time.Minute),
			}
			db.Create(&order)

			// Create order items
			for _, prod := range selectedProducts {
				qty := 1 + r.Intn(2)
				item := models.ShopOrderItem{
					TenantID:        tenant.ID,
					OrderID:         order.ID,
					ProductID:       &prod.ID,
					SKU:             prod.SKU,
					ProductName:     prod.Name,
					ProductImageURL: prod.ImageURL,
					Quantity:        qty,
					UnitPrice:       prod.Price,
					LineTotal:       prod.Price * float64(qty),
					CreatedAt:       createdAt,
					UpdatedAt:       createdAt,
				}
				db.Create(&item)
			}

			// Create status log(s)
			// At minimum, log the current status
			var fromStatus string
			var reason string
			switch status {
			case models.ShopOrderStatusPending:
				fromStatus = ""
				reason = "payment_pending"
			case models.ShopOrderStatusPaid:
				fromStatus = string(models.ShopOrderStatusPending)
				reason = "payment_confirmed"
			case models.ShopOrderStatusPreparing:
				fromStatus = string(models.ShopOrderStatusPaid)
				reason = "merchant_confirmed"
			case models.ShopOrderStatusShipped:
				fromStatus = string(models.ShopOrderStatusPreparing)
				reason = "merchant_shipped"
			case models.ShopOrderStatusCompleted:
				fromStatus = string(models.ShopOrderStatusShipped)
				reason = "merchant_completed"
			case models.ShopOrderStatusCancelled:
				fromStatus = string(models.ShopOrderStatusPaid)
				reason = "merchant_cancelled"
			}

			// Get owner user ID for this tenant
			var ownerUser models.MerchantUser
			db.Where("tenant_id = ? AND role = ?", tenant.ID, models.UserRoleOwner).First(&ownerUser)

			logEntry := models.ShopOrderStatusLog{
				TenantID:        tenant.ID,
				OrderID:         order.ID,
				FromStatus:      fromStatus,
				ToStatus:        string(status),
				Reason:          reason,
				Note:            note,
				TrackingNumber:  trackingNumber,
				CancelReason:    cancelReason,
				ChangedByUserID: &ownerUser.ID,
				ChangedAt:       order.UpdatedAt,
				CreatedAt:       order.UpdatedAt,
			}
			db.Create(&logEntry)
		}
	}

	log.Println("Shop seed data created successfully")
}

func seedClinicData(db *gorm.DB) {
	// Only seed for clinic-capable tenants (type=clinic or type=both)
	var clinicTenants []models.Tenant
	db.Where("type IN ?", []models.TenantType{models.TenantTypeBoth, models.TenantTypeClinic}).Find(&clinicTenants)
	if len(clinicTenants) == 0 {
		return
	}

	// Check if clinic_appointments already seeded
	var apptCount int64
	db.Model(&models.ClinicAppointment{}).Count(&apptCount)
	if apptCount > 0 {
		return // Already seeded
	}

	// Generate password hash for clinic users
	passwordHash, _ := bcrypt.GenerateFromPassword([]byte("Clinic123!"), bcrypt.DefaultCost)

	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	// Helper to get pointer to int
	ptrInt := func(v int) *int {
		return &v
	}

	// Helper to get pointer to float64
	ptrFloat := func(v float64) *float64 {
		return &v
	}

	for _, tenant := range clinicTenants {
		// Create doctors and frontdesk users
		doctorNames := []string{"Dr. Chen", "Dr. Li", "Dr. Wang", "Dr. Zhang", "Dr. Liu"}
		var doctorIDs []uint
		for i, name := range doctorNames {
			email := fmt.Sprintf("doctor%d@clinic%d.test", i+1, tenant.ID)
			// Check if user exists
			var existing models.MerchantUser
			if err := db.Where("email = ?", email).First(&existing).Error; err == nil {
				doctorIDs = append(doctorIDs, existing.ID)
				continue
			}
			user := models.MerchantUser{
				TenantID:           tenant.ID,
				Email:              email,
				PasswordHash:       string(passwordHash),
				Name:               name,
				Role:               models.UserRoleDoctor,
				ActiveBusinessType: models.BusinessTypeClinic,
				CanSwitch:          false,
				Status:             models.UserStatusActive,
			}
			db.Create(&user)
			doctorIDs = append(doctorIDs, user.ID)
		}

		// Create frontdesk
		frontdeskEmail := fmt.Sprintf("frontdesk@clinic%d.test", tenant.ID)
		var frontdesk models.MerchantUser
		if err := db.Where("email = ?", frontdeskEmail).First(&frontdesk).Error; err != nil {
			frontdesk = models.MerchantUser{
				TenantID:           tenant.ID,
				Email:              frontdeskEmail,
				PasswordHash:       string(passwordHash),
				Name:               "Front Desk",
				Role:               models.UserRoleFrontdesk,
				ActiveBusinessType: models.BusinessTypeClinic,
				CanSwitch:          false,
				Status:             models.UserStatusActive,
			}
			db.Create(&frontdesk)
		}

		// Pet and owner data
		petNames := []string{"Buddy", "Max", "Luna", "Charlie", "Bella", "Lucy", "Cooper", "Daisy"}
		ownerNames := []string{"Chan Tai Man", "Li Siu Ming", "Wong Ah Kuen", "Lam Ching Wan", "Ng Fai", "Chan Wing Yi", "Leung Siu Ha", "Cheung Chi Fung"}
		ownerPhones := []string{"+85291234567", "+85292345678", "+85293456789", "+85294567890", "+85295678901", "+85296789012", "+85297890123", "+85298901234"}
		visitTypes := []string{"checkup", "vaccine", "surgery", "emergency", "dental", "followup"}

		// Create 20 appointments: pending 3, confirmed 4, checked_in 2, in_progress 3, completed 6, cancelled 2
		now := time.Now()
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

		appointmentStatuses := []models.ClinicAppointmentStatus{
			models.ClinicAppointmentStatusPending, models.ClinicAppointmentStatusPending, models.ClinicAppointmentStatusPending,
			models.ClinicAppointmentStatusConfirmed, models.ClinicAppointmentStatusConfirmed, models.ClinicAppointmentStatusConfirmed, models.ClinicAppointmentStatusConfirmed,
			models.ClinicAppointmentStatusCheckedIn, models.ClinicAppointmentStatusCheckedIn,
			models.ClinicAppointmentStatusInProgress, models.ClinicAppointmentStatusInProgress, models.ClinicAppointmentStatusInProgress,
			models.ClinicAppointmentStatusCompleted, models.ClinicAppointmentStatusCompleted, models.ClinicAppointmentStatusCompleted, models.ClinicAppointmentStatusCompleted, models.ClinicAppointmentStatusCompleted, models.ClinicAppointmentStatusCompleted,
			models.ClinicAppointmentStatusCancelled, models.ClinicAppointmentStatusCancelled,
		}

		var createdAppointments []models.ClinicAppointment
		for i := 0; i < 20; i++ {
			status := appointmentStatuses[i]

			// Time distribution: last 14 days, today at least 5
			var scheduledAt time.Time
			if i < 5 {
				// Today: spread throughout the day
				hour := 9 + (i * 2)
				scheduledAt = time.Date(today.Year(), today.Month(), today.Day(), hour, 0, 0, 0, time.UTC)
			} else {
				// Past 14 days
				daysAgo := 1 + r.Intn(13)
				hour := 9 + r.Intn(8)
				scheduledAt = today.AddDate(0, 0, -daysAgo).Add(time.Duration(hour) * time.Hour)
			}

			petName := petNames[r.Intn(len(petNames))]
			ownerName := ownerNames[r.Intn(len(ownerNames))]
			ownerPhone := ownerPhones[r.Intn(len(ownerPhones))]
			doctorID := doctorIDs[r.Intn(len(doctorIDs))]
			visitType := visitTypes[r.Intn(len(visitTypes))]

			var cancelReason string
			if status == models.ClinicAppointmentStatusCancelled {
				cancelReasons := []string{"owner_cancelled", "no_show", "rescheduled"}
				cancelReason = cancelReasons[r.Intn(len(cancelReasons))]
			}

			appt := models.ClinicAppointment{
				TenantID:      tenant.ID,
				BusinessType:  string(models.BusinessTypeClinic),
				PetName:       petName,
				PetOwnerName:  ownerName,
				PetOwnerPhone: ownerPhone,
				DoctorID:      doctorID,
				VisitType:     visitType,
				ScheduledAt:   scheduledAt,
				Status:        status,
				CancelReason:  cancelReason,
				Notes:         "",
				CreatedAt:     scheduledAt.Add(-24 * time.Hour),
				UpdatedAt:     scheduledAt,
			}
			db.Create(&appt)
			createdAppointments = append(createdAppointments, appt)
		}

		// Create visits for in_progress and completed appointments
		// Status distribution: in_progress 1, diagnosed 1, treated 1, prescription_done 1, closed 1
		visitStatuses := []models.ClinicVisitStatus{
			models.ClinicVisitStatusInProgress,
			models.ClinicVisitStatusDiagnosed,
			models.ClinicVisitStatusTreated,
			models.ClinicVisitStatusPrescriptionDone,
			models.ClinicVisitStatusClosed,
		}

		var createdVisits []models.ClinicVisit
		// Find appointments that are in_progress or completed to link visits
		var apptsForVisits []models.ClinicAppointment
		for _, appt := range createdAppointments {
			if appt.Status == models.ClinicAppointmentStatusInProgress || appt.Status == models.ClinicAppointmentStatusCompleted {
				apptsForVisits = append(apptsForVisits, appt)
				if len(apptsForVisits) >= 5 {
					break
				}
			}
		}

		for i, appt := range apptsForVisits {
			if i >= 5 {
				break
			}
			// Update appointment to checked_in if needed for visit creation
			if appt.Status == models.ClinicAppointmentStatusInProgress {
				db.Model(&appt).Updates(map[string]interface{}{
					"status": models.ClinicAppointmentStatusInProgress,
				})
			}

			petBreeds := []string{"Golden Retriever", "Poodle", "Bulldog", "Beagle", "Labrador"}
			petAges := []string{"1 year", "2 years", "3 years", "4 years", "5 years"}
			petWeights := []float64{10.5, 15.3, 22.7, 12.1, 25.0}

			visit := models.ClinicVisit{
				TenantID:               tenant.ID,
				AppointmentID:          appt.ID,
				PetName:                appt.PetName,
				PetBreed:               petBreeds[r.Intn(len(petBreeds))],
				PetAge:                 petAges[r.Intn(len(petAges))],
				PetWeight:              petWeights[r.Intn(len(petWeights))],
				PetMedicalHistory:      "No known allergies",
				ChiefComplaint:         "Regular checkup",
				Temperature:            ptrFloat(float64(385+r.Intn(10)) / 10.0),
				HeartRate:              ptrInt(80 + r.Intn(40)),
				RespiratoryRate:        ptrInt(20 + r.Intn(10)),
				GeneralMedicationNotes: "",
				Status:                 visitStatuses[i],
				PushedAt:               nil,
				CreatedAt:              appt.ScheduledAt,
				UpdatedAt:              appt.ScheduledAt.Add(30 * time.Minute),
			}
			db.Create(&visit)
			createdVisits = append(createdVisits, visit)

			// Create diagnoses (1-3 per visit, only 1 primary)
			numDiagnoses := 1 + r.Intn(3)
			diagnosisNames := []string{"Canine Distemper", "Ear Infection", "Skin Allergy", "Dental Disease", "Arthritis", " obesity"}
			for j := 0; j < numDiagnoses; j++ {
				diag := models.ClinicDiagnosis{
					VisitID:   visit.ID,
					TenantID:  tenant.ID,
					Name:      diagnosisNames[r.Intn(len(diagnosisNames))],
					IsPrimary: j == 0,
					Notes:     "",
				}
				db.Create(&diag)
			}

			// Create prescriptions (1-2 per visit)
			if i >= 2 { // diagnosed and beyond have prescriptions
				numPrescriptions := 1 + r.Intn(2)
				drugNames := []string{"Amoxicillin", "Carprofen", "Metronidazole", "Prednisone", "Gabapentin"}
				dosages := []string{"250mg", "500mg", "100mg", "50mg"}
				frequencies := []string{"twice daily", "once daily", "three times daily"}
				for j := 0; j < numPrescriptions; j++ {
					presc := models.ClinicPrescription{
						VisitID:      visit.ID,
						TenantID:     tenant.ID,
						DrugName:     drugNames[r.Intn(len(drugNames))],
						Dosage:       dosages[r.Intn(len(dosages))],
						Frequency:    frequencies[r.Intn(len(frequencies))],
						DurationDays: 7 + r.Intn(14),
						Notes:        "take with food",
					}
					db.Create(&presc)
				}
			}

			// Create treatments (1-2 per visit)
			if i >= 3 { // treated and beyond have treatments
				numTreatments := 1 + r.Intn(2)
				treatmentNames := []string{"IV Fluid Therapy", "Vaccination", "Wound Care", "Dental Cleaning", "Blood Test"}
				for j := 0; j < numTreatments; j++ {
					treatment := models.ClinicTreatment{
						VisitID:       visit.ID,
						TenantID:      tenant.ID,
						Name:          treatmentNames[r.Intn(len(treatmentNames))],
						PerformedByID: doctorIDs[0],
						Fee:           float64(200 + r.Intn(800)),
						Currency:      "HKD",
						Notes:         "",
					}
					db.Create(&treatment)
				}
			}
		}

		// Create followups: pending 3 (1 overdue), done 2, skipped 1
		for i := 0; i < 6; i++ {
			var status models.ClinicFollowupStatus
			var dueAt time.Time
			var resultNote string

			if i < 3 {
				status = models.ClinicFollowupStatusPending
				if i == 0 {
					// Overdue: due in the past
					dueAt = today.AddDate(0, 0, -3)
				} else {
					// Future: next 7-14 days
					dueAt = today.AddDate(0, 0, 7+r.Intn(7))
				}
				resultNote = ""
			} else if i < 5 {
				status = models.ClinicFollowupStatusDone
				dueAt = today.AddDate(0, 0, -5+r.Intn(10))
				resultNote = "Pet recovering well"
			} else {
				status = models.ClinicFollowupStatusSkipped
				dueAt = today.AddDate(0, 0, -2)
				resultNote = "Owner declined"
			}

			if len(createdVisits) > 0 {
				visit := createdVisits[r.Intn(len(createdVisits))]
				followup := models.ClinicFollowup{
					VisitID:    visit.ID,
					TenantID:   tenant.ID,
					PetName:    visit.PetName,
					Reason:     "Post-treatment checkup",
					DoctorID:   doctorIDs[0],
					DueAt:      dueAt,
					Status:     status,
					ResultNote: resultNote,
					CreatedAt:  time.Now(),
					UpdatedAt:  time.Now(),
				}
				db.Create(&followup)
			}
		}

		// Create pharmacy items: 10 total - 5 prescription, 5 OTC, 2 low stock, 1 expiring soon, 1 expired
		pharmacyData := []struct {
			name       string
			spec       string
			batchNo    string
			stock      int
			threshold  int
			rxOnly     bool
			expiryDays int // negative = past, 0 = today, positive = future
			storage    string
		}{
			{"Amoxicillin 250mg", "250mg x 100 tablets", "BATCH-001", 85, 20, true, 90, "room_temp"},
			{"Carprofen 100mg", "100mg x 50 tablets", "BATCH-002", 42, 15, true, 60, "room_temp"},
			{"Metronidazole 500mg", "500mg x 30 tablets", "BATCH-003", 3, 10, true, 120, "room_temp"}, // low stock, rx
			{"Prednisone 50mg", "50mg x 30 tablets", "BATCH-004", 28, 20, true, 45, "room_temp"},      // low stock
			{"Gabapentin 300mg", "300mg x 60 capsules", "BATCH-005", 55, 25, true, 75, "room_temp"},
			{"Saline Solution", "500ml", "BATCH-006", 120, 30, false, 180, "refrigerated"},
			{"Hydrogen Peroxide 3%", "100ml", "BATCH-007", 8, 10, false, 25, "room_temp"}, // expiring soon, low stock
			{"Gauze Pads", "10x10cm, 100pcs", "BATCH-008", 200, 50, false, 365, "room_temp"},
			{"Flea Treatment", "For dogs 20-40kg", "BATCH-009", 15, 20, false, -10, "room_temp"}, // expired
			{"Vitamin B Complex", "100 tablets", "BATCH-010", 90, 30, false, 200, "room_temp"},
		}

		for _, p := range pharmacyData {
			item := models.PharmacyItem{
				TenantID:           tenant.ID,
				Name:               p.name,
				Specification:      p.spec,
				BatchNo:            p.batchNo,
				ExpiresAt:          now.AddDate(0, 0, p.expiryDays),
				StockLevel:         p.stock,
				LowStockThreshold:  p.threshold,
				StorageCondition:   p.storage,
				IsPrescriptionOnly: p.rxOnly,
				CreatedAt:          now.AddDate(0, -1, 0),
				UpdatedAt:          now,
			}
			db.Create(&item)
		}

		// Create clinic visit files (4-6 files distributed across 2-3 visits)
		if len(createdVisits) >= 2 {
			fileTypes := []string{"blood_test.pdf", "xray.jpg", "prescription.pdf", "photo.png", "report.pdf"}
			for i := 0; i < 4+r.Intn(3); i++ {
				visitIdx := i % min(3, len(createdVisits))
				visit := createdVisits[visitIdx]
				fileType := fileTypes[r.Intn(len(fileTypes))]
				ext := ".pdf"
				if strings.Contains(fileType, "jpg") {
					ext = ".jpg"
				} else if strings.Contains(fileType, "png") {
					ext = ".png"
				}
				file := models.ClinicVisitFile{
					VisitID:    visit.ID,
					TenantID:   tenant.ID,
					FileName:   fmt.Sprintf("test_file_%d%s", i+1, ext),
					FileURL:    fmt.Sprintf("assets/clinic_files/%d/%d/test_file_%d%s", tenant.ID, visit.ID, i+1, ext),
					FileSize:   int64(1024 + r.Intn(10000)),
					FileType:   "application/pdf",
					UploadedAt: now.Add(-time.Duration(r.Intn(72)) * time.Hour),
					CreatedAt:  now.Add(-time.Duration(r.Intn(72)) * time.Hour),
				}
				db.Create(&file)
			}
		}

		// Create insurance claims: submitted 1, processing 1, approved 1
		if len(createdVisits) >= 3 {
			claimStatuses := []models.InsuranceClaimStatus{
				models.InsuranceClaimStatusSubmitted,
				models.InsuranceClaimStatusProcessing,
				models.InsuranceClaimStatusApproved,
			}

			for i := 0; i < 3; i++ {
				visit := createdVisits[i]
				expenseItems := []map[string]interface{}{
					{"item_name": "Consultation", "amount": 500.0 + float64(r.Intn(500)), "is_covered": true},
					{"item_name": "Medication", "amount": 300.0 + float64(r.Intn(700)), "is_covered": true},
				}
				expenseJSON, _ := json.Marshal(expenseItems)

				claim := models.InsuranceClaim{
					TenantID:         tenant.ID,
					VisitID:          visit.ID,
					PolicyNo:         fmt.Sprintf("POL-HK-%04d", int(tenant.ID)*10+i+1),
					ProviderName:     "PetCare Insurance",
					PlanName:         "Gold Plan",
					ClaimAmount:      800.0 + float64(r.Intn(1200)),
					ApprovedAmount:   0,
					Currency:         "HKD",
					DiagnosisSummary: "Canine Distemper",
					ExpenseItemsJSON: string(expenseJSON),
					Notes:            "Submitted by clinic",
					Status:           claimStatuses[i],
					SubmittedAt:      now.AddDate(0, 0, -r.Intn(30)),
					CreatedAt:        now.AddDate(0, 0, -r.Intn(30)),
					UpdatedAt:        now,
				}
				if claim.Status == models.InsuranceClaimStatusApproved {
					claim.ApprovedAmount = claim.ClaimAmount * 0.8
				}
				db.Create(&claim)

				// Create 1-2 claim files per claim
				numFiles := 1 + r.Intn(2)
				for j := 0; j < numFiles; j++ {
					claimFile := models.InsuranceClaimFile{
						TenantID:   tenant.ID,
						ClaimID:    claim.ID,
						FileName:   fmt.Sprintf("invoice_%d.pdf", j+1),
						FileURL:    fmt.Sprintf("assets/insurance_claim_files/%d/%d/invoice_%d.pdf", tenant.ID, claim.ID, j+1),
						FileSize:   int64(2048 + r.Intn(20000)),
						FileType:   "application/pdf",
						UploadedAt: now.Add(-time.Duration(r.Intn(48)) * time.Hour),
						CreatedAt:  now.Add(-time.Duration(r.Intn(48)) * time.Hour),
					}
					db.Create(&claimFile)
				}
			}
		}
	}

	log.Println("Clinic seed data created successfully")
}

func seedPhase4AData(db *gorm.DB) {
	var count int64
	db.Model(&models.MerchantProject{}).Count(&count)
	if count > 0 {
		return
	}

	var tenant1 models.Tenant
	if err := db.Where("id = ?", 1).First(&tenant1).Error; err != nil {
		log.Println("Phase 4A seed skipped: tenant 1 not found")
		return
	}

	createProjectBundle := func(projectCode, name, baseURL, keyPrefix, rawKey, environment, clinicIntegrationID string, tenantID uint) error {
		keyHash, err := bcrypt.GenerateFromPassword([]byte(rawKey), bcrypt.DefaultCost)
		if err != nil {
			return err
		}

		project := models.MerchantProject{
			ProjectCode: projectCode,
			TenantID:    tenantID,
			Name:        name,
			BaseURL:     baseURL,
			Status:      "active",
		}
		if err := db.Create(&project).Error; err != nil {
			return err
		}

		appKey := models.MerchantAppKey{
			ProjectID:   project.ID,
			KeyPrefix:   keyPrefix,
			KeyHash:     string(keyHash),
			Environment: environment,
			Status:      "active",
		}
		if err := db.Create(&appKey).Error; err != nil {
			return err
		}

		binding := models.ClinicIntegrationBinding{
			ProjectID:           project.ID,
			TenantID:            tenantID,
			ClinicIntegrationID: clinicIntegrationID,
			BusinessType:        "clinic",
			DefaultDoctorID:     nil,
			Timezone:            "Asia/Hong_Kong",
			Status:              "active",
		}
		if err := db.Create(&binding).Error; err != nil {
			return err
		}

		for day := 0; day <= 6; day++ {
			template := models.ClinicScheduleTemplate{
				TenantID:        tenantID,
				DayOfWeek:       day,
				OpenTime:        "09:00",
				CloseTime:       "18:00",
				SlotDurationMin: 30,
				IsActive:        day != 0,
			}
			if err := db.Create(&template).Error; err != nil {
				return err
			}
		}

		return nil
	}

	if err := createProjectBundle("happypaws-hk", "Happy Paws HK", "http://localhost:8080", "pk_app_test", "pk_app_test_secret_key_dev", "dev", "clinic_happypaws_hk", 1); err != nil {
		log.Println("Phase 4A seed failed for tenant 1:", err)
		return
	}

	var tenant2 models.Tenant
	if err := db.Where("id = ?", 2).First(&tenant2).Error; err == nil {
		if err := createProjectBundle("pawsclinic-hk", "Paws Clinic HK", "http://localhost:8080", "pk_app_paws", "pk_app_paws_secret_key_dev", "dev", "clinic_pawsclinic_hk", 2); err != nil {
			log.Println("Phase 4A seed failed for tenant 2:", err)
			return
		}
	}

	log.Println("Phase 4A seed data created successfully")
}

func ensureSeedTenantRoutingConfig(db *gorm.DB, tenantID uint, tier models.SubscriptionTier, mode models.TenancyMode, schemaName, databaseKey string) {
	var existing models.TenantRoutingConfig
	if err := db.Where("tenant_id = ?", tenantID).First(&existing).Error; err == nil {
		return
	}

	config := models.TenantRoutingConfig{
		TenantID:         tenantID,
		SubscriptionTier: tier,
		TenancyMode:      mode,
		SchemaName:       schemaName,
		DatabaseKey:      databaseKey,
		Status:           models.TenantRoutingStatusActive,
	}
	if err := config.Validate(); err != nil {
		log.Printf("tenant routing seed skipped for tenant %d: %v", tenantID, err)
		return
	}
	if err := db.Create(&config).Error; err != nil {
		log.Printf("tenant routing seed failed for tenant %d: %v", tenantID, err)
	}
}

func ensureExistingTenantRoutingConfigs(db *gorm.DB) {
	var tenants []models.Tenant
	if err := db.Select("id").Find(&tenants).Error; err != nil {
		log.Printf("tenant routing backfill skipped: failed to load tenants: %v", err)
		return
	}

	for _, tenant := range tenants {
		ensureSeedTenantRoutingConfig(
			db,
			tenant.ID,
			models.SubscriptionTierOnboarding,
			models.TenancyModeSharedRLS,
			"",
			"",
		)
	}
}

// seedClinicPatientsAndClients seeds clinic_clients, clinic_patients, and health_reminders
// from existing appointment data. Idempotent — skips if any clients already exist.
func seedClinicPatientsAndClients(db *gorm.DB) {
	var count int64
	db.Model(&models.ClinicClient{}).Count(&count)
	if count > 0 {
		return
	}

	now := time.Now()

	type ownerKey struct {
		Name     string
		Phone    string
		TenantID uint
	}

	// Collect unique owners from appointments
	type apptRow struct {
		PetOwnerName  string
		PetOwnerPhone string
		TenantID      uint
	}
	var apptRows []apptRow
	db.Model(&models.ClinicAppointment{}).
		Select("DISTINCT pet_owner_name, pet_owner_phone, tenant_id").
		Scan(&apptRows)

	ownerToClient := map[ownerKey]*models.ClinicClient{}

	for _, row := range apptRows {
		key := ownerKey{Name: row.PetOwnerName, Phone: row.PetOwnerPhone, TenantID: row.TenantID}
		if _, exists := ownerToClient[key]; exists {
			continue
		}
		parts := strings.SplitN(row.PetOwnerName, " ", 2)
		first, last := parts[0], ""
		if len(parts) == 2 {
			last = parts[1]
		}
		email := strings.ToLower(strings.ReplaceAll(row.PetOwnerName, " ", ".")) + "@example.com"
		client := &models.ClinicClient{
			TenantID:  row.TenantID,
			FirstName: first,
			LastName:  last,
			Phone:     row.PetOwnerPhone,
			Email:     email,
			Active:    true,
		}
		if err := db.Create(client).Error; err == nil {
			ownerToClient[key] = client
		}
	}

	// Species + breed pools
	type speciesBreed struct{ species, breed string }
	sbPool := []speciesBreed{
		{"Dog", "Golden Retriever"}, {"Dog", "Labrador"}, {"Dog", "Poodle"},
		{"Dog", "Shiba Inu"}, {"Dog", "Corgi"}, {"Dog", "Beagle"},
		{"Cat", "British Shorthair"}, {"Cat", "Ragdoll"}, {"Cat", "Siamese"},
		{"Cat", "Scottish Fold"}, {"Rabbit", "Holland Lop"}, {"Hamster", "Syrian"},
	}
	genders := []string{"Male", "Female", "Male", "Female"}

	type petKey struct {
		PetName  string
		ClientID uint
	}
	petToPatient := map[petKey]*models.ClinicPatient{}

	type apptPetRow struct {
		PetName       string
		PetOwnerName  string
		PetOwnerPhone string
		TenantID      uint
	}
	var apptPetRows []apptPetRow
	db.Model(&models.ClinicAppointment{}).
		Select("DISTINCT pet_name, pet_owner_name, pet_owner_phone, tenant_id").
		Scan(&apptPetRows)

	for i, row := range apptPetRows {
		key := ownerKey{Name: row.PetOwnerName, Phone: row.PetOwnerPhone, TenantID: row.TenantID}
		client, ok := ownerToClient[key]
		if !ok {
			continue
		}
		pk := petKey{PetName: row.PetName, ClientID: client.ID}
		if _, exists := petToPatient[pk]; exists {
			continue
		}
		sb := sbPool[i%len(sbPool)]
		gender := genders[i%len(genders)]
		dob := now.AddDate(-(2 + i%8), -(i % 12), 0)
		weight := 3.5 + float64(i%15)*0.7
		patient := &models.ClinicPatient{
			TenantID:    row.TenantID,
			ClientID:    client.ID,
			Name:        row.PetName,
			Gender:      gender,
			DateOfBirth: &dob,
			Weight:      weight,
			WeightUnit:  "kg",
			Active:      true,
		}
		// Set species/breed via IDs if they exist, else store names in notes
		var sp models.AnimalSpecies
		if db.Where("name = ?", sb.species).First(&sp).Error == nil {
			patient.SpeciesID = &sp.ID
		}
		var br models.AnimalBreed
		if db.Where("name = ?", sb.breed).First(&br).Error == nil {
			patient.BreedID = &br.ID
		}
		if err := db.Create(patient).Error; err == nil {
			petToPatient[pk] = patient
		}
	}

	// Link appointments to patients
	var appts []models.ClinicAppointment
	db.Find(&appts)
	for _, appt := range appts {
		key := ownerKey{Name: appt.PetOwnerName, Phone: appt.PetOwnerPhone, TenantID: appt.TenantID}
		client, ok := ownerToClient[key]
		if !ok {
			continue
		}
		pk := petKey{PetName: appt.PetName, ClientID: client.ID}
		patient, ok := petToPatient[pk]
		if !ok {
			continue
		}
		db.Model(&appt).Updates(map[string]interface{}{
			"patient_id": patient.ID,
			"client_id":  client.ID,
		})
	}

	// Create health reminders
	reminderTemplates := []struct {
		Category   string
		Name       string
		Importance string
		OffsetDays int
	}{
		{"vaccine", "Rabies Vaccine", "high", -15},
		{"vaccine", "Annual DHPP", "high", 14},
		{"deworm", "Monthly Deworming", "medium", -7},
		{"deworm", "Heartworm Prevention", "medium", 21},
		{"checkup", "Annual Physical Exam", "medium", -30},
		{"dental", "Dental Cleaning", "low", 45},
		{"vaccine", "Bordetella Vaccine", "medium", 7},
		{"checkup", "Blood Panel", "medium", 60},
	}

	i := 0
	for _, patient := range petToPatient {
		tmpl := reminderTemplates[i%len(reminderTemplates)]
		dueAt := now.AddDate(0, 0, tmpl.OffsetDays+i%5)
		var lastFulfilled *time.Time
		if tmpl.OffsetDays < 0 {
			t := dueAt.AddDate(0, -1, 0)
			lastFulfilled = &t
		}
		reminder := models.HealthReminder{
			TenantID:        patient.TenantID,
			PatientID:       patient.ID,
			Category:        tmpl.Category,
			Name:            tmpl.Name,
			Importance:      tmpl.Importance,
			DueAt:           &dueAt,
			LastFulfilledAt: lastFulfilled,
			Active:          true,
		}
		db.Create(&reminder)
		// Add a second reminder for some pets
		if i%3 == 0 {
			tmpl2 := reminderTemplates[(i+3)%len(reminderTemplates)]
			due2 := now.AddDate(0, 0, tmpl2.OffsetDays+i%7)
			r2 := models.HealthReminder{
				TenantID:   patient.TenantID,
				PatientID:  patient.ID,
				Category:   tmpl2.Category,
				Name:       tmpl2.Name,
				Importance: tmpl2.Importance,
				DueAt:      &due2,
				Active:     true,
			}
			db.Create(&r2)
		}
		i++
	}

	log.Printf("Clinic patients/clients seed: %d clients, %d patients created",
		len(ownerToClient), len(petToPatient))
}

// seedClinicScheduleTemplates seeds default operating hours for all tenants
// that do not yet have any ClinicScheduleTemplate rows.
// Mon–Fri 09:00–18:00 (slot 30 min), Sat 09:00–13:00, Sun closed.
func seedClinicScheduleTemplates(db *gorm.DB) {
	var tenants []models.Tenant
	db.Find(&tenants)

	for _, tenant := range tenants {
		var existing int64
		db.Model(&models.ClinicScheduleTemplate{}).
			Where("tenant_id = ?", tenant.ID).Count(&existing)
		if existing > 0 {
			continue // already seeded
		}

		templates := []models.ClinicScheduleTemplate{
			// Sun (0) — closed
			{TenantID: tenant.ID, DayOfWeek: 0, OpenTime: "09:00", CloseTime: "13:00", SlotDurationMin: 30, IsActive: false},
			// Mon (1) – Fri (5) — 09:00–18:00
			{TenantID: tenant.ID, DayOfWeek: 1, OpenTime: "09:00", CloseTime: "18:00", SlotDurationMin: 30, IsActive: true},
			{TenantID: tenant.ID, DayOfWeek: 2, OpenTime: "09:00", CloseTime: "18:00", SlotDurationMin: 30, IsActive: true},
			{TenantID: tenant.ID, DayOfWeek: 3, OpenTime: "09:00", CloseTime: "18:00", SlotDurationMin: 30, IsActive: true},
			{TenantID: tenant.ID, DayOfWeek: 4, OpenTime: "09:00", CloseTime: "18:00", SlotDurationMin: 30, IsActive: true},
			{TenantID: tenant.ID, DayOfWeek: 5, OpenTime: "09:00", CloseTime: "18:00", SlotDurationMin: 30, IsActive: true},
			// Sat (6) — half day
			{TenantID: tenant.ID, DayOfWeek: 6, OpenTime: "09:00", CloseTime: "13:00", SlotDurationMin: 30, IsActive: true},
		}
		if err := db.Create(&templates).Error; err != nil {
			log.Printf("Failed to seed schedule templates for tenant %d: %v", tenant.ID, err)
		} else {
			log.Printf("Seeded clinic schedule templates for tenant %d (%s)", tenant.ID, tenant.Name)
		}
	}
}

package main

import (
	"log"
	"petwell-merchant-backend/handlers"
	"petwell-merchant-backend/middleware"
	"petwell-merchant-backend/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func main() {
	// Initialize database
	db, err := gorm.Open(sqlite.Open("petwell.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto migrate models
	if err := db.AutoMigrate(
		&models.Tenant{},
		&models.MerchantUser{},
		&models.MerchantSession{},
	); err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Seed initial data
	seedData(db)

	// Setup Gin router
	r := gin.Default()

	// API group /merchant
	merchant := r.Group("/merchant")

	// Auth routes (no authentication required)
	auth := merchant.Group("/auth")
	{
		auth.POST("/login", handlers.Login(db))
	}

	// Protected routes (authentication required)
	protected := merchant.Group("")
	protected.Use(middleware.MerchantAuthMiddleware(db))
	{
		protected.GET("/me", handlers.GetMe(db))
		protected.PATCH("/me/switch", handlers.SwitchBusiness(db))
	}

	log.Println("Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func seedData(db *gorm.DB) {
	// Check if data already exists
	var count int64
	db.Model(&models.Tenant{}).Count(&count)
	if count > 0 {
		return // Data already seeded
	}

	// Create Tenant 1: Happy Paws (type=both, status=active)
	tenant1 := models.Tenant{
		Name:   "Happy Paws",
		Type:   models.TenantTypeBoth,
		Status: models.TenantStatusActive,
	}
	db.Create(&tenant1)

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
}

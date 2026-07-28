package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	maxInsuranceFileSize = 20 * 1024 * 1024 // 20MB
)

// InsuranceCoverageItem represents a coverage item in the preview response
type InsuranceCoverageItem struct {
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	CoveragePct    int     `json:"coverage_pct"`
	AnnualLimit    float64 `json:"annual_limit"`
	RemainingLimit float64 `json:"remaining_limit"`
	IsCovered      bool    `json:"is_covered"`
}

// CoveragePreviewResponse represents the response for GET /merchant/clinic/insurance/coverage-preview
type CoveragePreviewResponse struct {
	VisitID       uint                    `json:"visit_id"`
	PetName       string                  `json:"pet_name"`
	PetOwnerName  string                  `json:"pet_owner_name"`
	Policy        InsurancePolicySnapshot `json:"policy"`
	CoverageItems []InsuranceCoverageItem `json:"coverage_items"`
}

// InsurancePolicySnapshot represents the policy info in coverage preview
type InsurancePolicySnapshot struct {
	PolicyNo     string `json:"policy_no"`
	ProviderName string `json:"provider_name"`
	PlanName     string `json:"plan_name"`
	EffectiveAt  string `json:"effective_at"`
	ExpiresAt    string `json:"expires_at"`
}

// GetCoveragePreview handles GET /merchant/clinic/insurance/coverage-preview
// Note: This is read-only against frozen policy data. The contract specifies
// this should only read from existing frozen insurance tables, not modify them.
// For Phase 3, we return mock coverage data based on existing claim records.
func GetCoveragePreview(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		// visit_id is required
		visitIDStr := c.Query("visit_id")
		if visitIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40015, "data": nil, "message": "visit_id is required"})
			return
		}

		visitID, err := strconv.ParseUint(visitIDStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		// Verify visit exists
		var visit models.ClinicVisit
		if err := db.Where("id = ? AND tenant_id = ?", visitID, tenantID).First(&visit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30002, "data": nil, "message": "clinic visit not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Get pet owner name from appointment
		var petOwnerName string
		var appt models.ClinicAppointment
		if err := db.Where("id = ? AND tenant_id = ?", visit.AppointmentID, tenantID).First(&appt).Error; err == nil {
			petOwnerName = appt.PetOwnerName
		}

		// For Phase 3: return mock insurance coverage data
		// In production, this would query frozen insurance policy tables
		policy := InsurancePolicySnapshot{
			PolicyNo:     "POL-HK-0001",
			ProviderName: "PetCare Insurance",
			PlanName:     "Gold Plan",
			EffectiveAt:  "2026-01-01T00:00:00Z",
			ExpiresAt:    "2026-12-31T00:00:00Z",
		}

		coverageItems := []InsuranceCoverageItem{
			{
				ItemCode:       "CONSULT",
				ItemName:       "Consultation",
				CoveragePct:    80,
				AnnualLimit:    20000,
				RemainingLimit: 12000,
				IsCovered:      true,
			},
			{
				ItemCode:       "VACCINE",
				ItemName:       "Vaccination",
				CoveragePct:    100,
				AnnualLimit:    5000,
				RemainingLimit: 3500,
				IsCovered:      true,
			},
			{
				ItemCode:       "LABTEST",
				ItemName:       "Laboratory Tests",
				CoveragePct:    70,
				AnnualLimit:    10000,
				RemainingLimit: 7500,
				IsCovered:      true,
			},
			{
				ItemCode:       "SURGERY",
				ItemName:       "Surgery",
				CoveragePct:    60,
				AnnualLimit:    50000,
				RemainingLimit: 50000,
				IsCovered:      true,
			},
		}

		response := CoveragePreviewResponse{
			VisitID:       uint(visitID),
			PetName:       visit.PetName,
			PetOwnerName:  petOwnerName,
			Policy:        policy,
			CoverageItems: coverageItems,
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}

// InsuranceClaimItem represents a claim in the list response
type InsuranceClaimItem struct {
	ID             uint    `json:"id"`
	VisitID        uint    `json:"visit_id"`
	SubmittedAt    string  `json:"submitted_at"`
	PetName        string  `json:"pet_name"`
	PolicyNo       string  `json:"policy_no"`
	ProviderName   string  `json:"provider_name"`
	PlanName       string  `json:"plan_name"`
	ClaimAmount    float64 `json:"claim_amount"`
	ApprovedAmount float64 `json:"approved_amount"`
	Currency       string  `json:"currency"`
	Status         string  `json:"status"`
}

// ListClaimsQuery represents query parameters for GET /merchant/clinic/insurance/claims
type ListClaimsQuery struct {
	Status  string `form:"status"`
	Page    int    `form:"page,default=1"`
	PerPage int    `form:"per_page,default=20"`
}

// ListInsuranceClaims handles GET /merchant/clinic/insurance/claims
func ListInsuranceClaims(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		var query ListClaimsQuery
		if err := c.ShouldBindQuery(&query); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "invalid query params"})
			return
		}

		tenantID := authCtx.TenantID

		// Validate status if provided
		if query.Status != "" && !models.IsValidInsuranceClaimStatus(query.Status) {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40009, "data": nil, "message": "invalid insurance claim status"})
			return
		}

		// Pagination
		if query.Page < 1 {
			query.Page = 1
		}
		if query.PerPage < 1 {
			query.PerPage = 20
		}
		if query.PerPage > 100 {
			query.PerPage = 100
		}

		baseQuery := db.Model(&models.InsuranceClaim{}).Where("tenant_id = ?", tenantID)

		if query.Status != "" {
			baseQuery = baseQuery.Where("status = ?", query.Status)
		}

		var total int64
		baseQuery.Count(&total)

		offset := (query.Page - 1) * query.PerPage
		var claims []models.InsuranceClaim
		baseQuery.Preload("Visit").
			Order("submitted_at DESC").
			Offset(offset).
			Limit(query.PerPage).
			Find(&claims)

		items := make([]InsuranceClaimItem, len(claims))
		for i, claim := range claims {
			items[i] = InsuranceClaimItem{
				ID:             claim.ID,
				VisitID:        claim.VisitID,
				SubmittedAt:    claim.SubmittedAt.Format(time.RFC3339),
				PetName:        claim.Visit.PetName,
				PolicyNo:       claim.PolicyNo,
				ProviderName:   claim.ProviderName,
				PlanName:       claim.PlanName,
				ClaimAmount:    claim.ClaimAmount,
				ApprovedAmount: claim.ApprovedAmount,
				Currency:       claim.Currency,
				Status:         string(claim.Status),
			}
		}

		hasMore := int64(query.Page*query.PerPage) < total

		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"claims":   items,
				"total":    total,
				"page":     query.Page,
				"per_page": query.PerPage,
				"has_more": hasMore,
			},
			"message": "ok",
		})
	}
}

// CreateClaimExpenseItem represents an expense item in the claim request
type CreateClaimExpenseItem struct {
	ItemName  string  `json:"item_name" binding:"required"`
	Amount    float64 `json:"amount" binding:"required"`
	IsCovered bool    `json:"is_covered"`
}

// CreateInsuranceClaimRequest represents the request body for POST /merchant/clinic/insurance/claims
type CreateInsuranceClaimRequest struct {
	VisitID          uint                     `json:"visit_id" binding:"required"`
	PolicyNo         string                   `json:"policy_no" binding:"required"`
	ProviderName     string                   `json:"provider_name" binding:"required"`
	PlanName         string                   `json:"plan_name" binding:"required"`
	ClaimAmount      float64                  `json:"claim_amount" binding:"required"`
	Currency         string                   `json:"currency" binding:"required"`
	DiagnosisSummary string                   `json:"diagnosis_summary" binding:"required"`
	ExpenseItems     []CreateClaimExpenseItem `json:"expense_items" binding:"required"`
	Notes            string                   `json:"notes"`
}

// CreateInsuranceClaimResponse represents the response for POST /merchant/clinic/insurance/claims
type CreateInsuranceClaimResponse struct {
	ID          uint    `json:"id"`
	VisitID     uint    `json:"visit_id"`
	Status      string  `json:"status"`
	ClaimAmount float64 `json:"claim_amount"`
	Currency    string  `json:"currency"`
	SubmittedAt string  `json:"submitted_at"`
}

// CreateInsuranceClaim handles POST /merchant/clinic/insurance/claims
func CreateInsuranceClaim(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		var req CreateInsuranceClaimRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		// Validate claim_amount > 0
		if req.ClaimAmount <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40014, "data": nil, "message": "claim_amount must be greater than 0"})
			return
		}

		// Verify visit exists and belongs to tenant
		var visit models.ClinicVisit
		if err := db.Where("id = ? AND tenant_id = ?", req.VisitID, tenantID).First(&visit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30002, "data": nil, "message": "clinic visit not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Serialize expense items to JSON
		expenseItemsJSON, err := json.Marshal(req.ExpenseItems)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		now := time.Now()
		claim := models.InsuranceClaim{
			TenantID:         tenantID,
			VisitID:          req.VisitID,
			PolicyNo:         req.PolicyNo,
			ProviderName:     req.ProviderName,
			PlanName:         req.PlanName,
			ClaimAmount:      req.ClaimAmount,
			ApprovedAmount:   0,
			Currency:         req.Currency,
			DiagnosisSummary: req.DiagnosisSummary,
			ExpenseItemsJSON: string(expenseItemsJSON),
			Notes:            req.Notes,
			Status:           models.InsuranceClaimStatusSubmitted,
			SubmittedAt:      now,
			CreatedAt:        now,
			UpdatedAt:        now,
		}

		if err := db.Create(&claim).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		response := CreateInsuranceClaimResponse{
			ID:          claim.ID,
			VisitID:     claim.VisitID,
			Status:      string(claim.Status),
			ClaimAmount: claim.ClaimAmount,
			Currency:    claim.Currency,
			SubmittedAt: claim.SubmittedAt.Format(time.RFC3339),
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}

// UploadClaimFileResponse represents the response for POST /merchant/clinic/insurance/claims/:id/files
type UploadClaimFileResponse struct {
	ID         uint   `json:"id"`
	ClaimID    uint   `json:"claim_id"`
	FileName   string `json:"file_name"`
	FileURL    string `json:"file_url"`
	FileSize   int64  `json:"file_size"`
	FileType   string `json:"file_type"`
	UploadedAt string `json:"uploaded_at"`
}

// UploadClaimFile handles POST /merchant/clinic/insurance/claims/:id/files
func UploadClaimFile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID

		claimIDStr := c.Param("id")
		claimID, err := strconv.ParseUint(claimIDStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "invalid request"})
			return
		}

		// Verify claim exists and belongs to tenant
		var claim models.InsuranceClaim
		if err := db.Where("id = ? AND tenant_id = ?", claimID, tenantID).First(&claim).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 30005, "data": nil, "message": "insurance claim not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "unexpected server error"})
			return
		}

		// Get file from multipart form
		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40010, "data": nil, "message": "file is required"})
			return
		}

		// Validate file size
		if file.Size > maxInsuranceFileSize {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40011, "data": nil, "message": "file size exceeds 20MB limit"})
			return
		}

		// Validate file extension
		ext := strings.ToLower(filepath.Ext(file.Filename))
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".pdf" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40012, "data": nil, "message": "file type must be jpg, png, or pdf"})
			return
		}

		// Validate file content
		openFile, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "failed to read file"})
			return
		}
		defer openFile.Close()

		// Read first 512 bytes to detect content type
		buf := make([]byte, 512)
		n, err := openFile.Read(buf)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "failed to read file"})
			return
		}
		buf = buf[:n]

		// Validate content matches extension
		isValid := false
		switch ext {
		case ".jpg", ".jpeg":
			if len(buf) >= 3 && buf[0] == 0xFF && buf[1] == 0xD8 && buf[2] == 0xFF {
				isValid = true
			}
		case ".png":
			if len(buf) >= 4 && buf[0] == 0x89 && buf[1] == 0x50 && buf[2] == 0x4E && buf[3] == 0x47 {
				isValid = true
			}
		case ".pdf":
			if len(buf) >= 4 && buf[0] == 0x25 && buf[1] == 0x50 && buf[2] == 0x44 && buf[3] == 0x46 {
				isValid = true
			}
		}

		if !isValid {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40013, "data": nil, "message": "invalid file content"})
			return
		}

		// Create directory structure
		assetDir := fmt.Sprintf("assets/insurance_claim_files/%d/%d", tenantID, claimID)
		if err := os.MkdirAll(assetDir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "failed to create upload directory"})
			return
		}

		// Generate filename
		timestamp := time.Now().Unix()
		filename := fmt.Sprintf("%d-%s", timestamp, file.Filename)
		filePath := filepath.Join(assetDir, filename)

		// Save file
		if err := c.SaveUploadedFile(file, filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "failed to save file"})
			return
		}

		// Determine file type
		fileType := "application/octet-stream"
		switch ext {
		case ".jpg", ".jpeg":
			fileType = "image/jpeg"
		case ".png":
			fileType = "image/png"
		case ".pdf":
			fileType = "application/pdf"
		}

		// Create database record
		fileURL := fmt.Sprintf("assets/insurance_claim_files/%d/%d/%s", tenantID, claimID, filename)
		now := time.Now()

		claimFile := models.InsuranceClaimFile{
			TenantID:   tenantID,
			ClaimID:    uint(claimID),
			FileName:   file.Filename,
			FileURL:    fileURL,
			FileSize:   file.Size,
			FileType:   fileType,
			UploadedAt: now,
			CreatedAt:  now,
		}

		if err := db.Create(&claimFile).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "data": nil, "message": "failed to save file record"})
			return
		}

		response := UploadClaimFileResponse{
			ID:         claimFile.ID,
			ClaimID:    claimFile.ClaimID,
			FileName:   claimFile.FileName,
			FileURL:    claimFile.FileURL,
			FileSize:   claimFile.FileSize,
			FileType:   claimFile.FileType,
			UploadedAt: claimFile.UploadedAt.Format(time.RFC3339),
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "ok"})
	}
}

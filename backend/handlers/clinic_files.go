package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"pawrd-merchant-backend/middleware"
	"pawrd-merchant-backend/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	maxFileSize = 20 * 1024 * 1024 // 20MB
)

var allowedMimeTypes = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"application/pdf": true,
}

var allowedExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".pdf":  true,
}

// UploadVisitFileRequest represents the response after uploading a file
type UploadVisitFileResponse struct {
	ID         uint   `json:"id"`
	FileName   string `json:"file_name"`
	FileURL    string `json:"file_url"`
	FileSize   int64  `json:"file_size"`
	FileType   string `json:"file_type"`
	UploadedAt string `json:"uploaded_at"`
}

// UploadVisitFile handles POST /merchant/clinic/visits/:id/files
func UploadVisitFile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db = middleware.GetTenantDB(c, db)
		authCtx, ok := middleware.GetAuthContext(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 20001, "data": nil, "message": "X-Session-ID header is required"})
			return
		}

		tenantID := authCtx.TenantID
		visitIDStr := c.Param("id")

		// Parse visit ID
		var visitID uint
		if _, err := fmt.Sscanf(visitIDStr, "%d", &visitID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40001, "data": nil, "message": "invalid visit id"})
			return
		}

		// Verify visit exists and belongs to tenant
		var visit models.ClinicVisit
		if err := db.Where("id = ? AND tenant_id = ?", visitID, tenantID).First(&visit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"code": 40401, "data": nil, "message": "visit not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "database error"})
			}
			return
		}

		// Get file from multipart form
		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40002, "data": nil, "message": "file is required"})
			return
		}

		// Validate file size
		if file.Size > maxFileSize {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40003, "data": nil, "message": "file size exceeds 20MB limit"})
			return
		}

		// Validate file extension
		ext := strings.ToLower(filepath.Ext(file.Filename))
		if !allowedExtensions[ext] {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40004, "data": nil, "message": "file type not allowed (only JPG/PNG/PDF)"})
			return
		}

		// Validate MIME type
		openFile, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to read file"})
			return
		}
		defer openFile.Close()

		// Read first 512 bytes to detect MIME type
		buf := make([]byte, 512)
		n, err := openFile.Read(buf)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to read file"})
			return
		}
		buf = buf[:n]

		// Basic MIME type validation based on file signatures
		isValid := false
		switch {
		case strings.HasSuffix(strings.ToLower(file.Filename), ".jpg") || strings.HasSuffix(strings.ToLower(file.Filename), ".jpeg"):
			// JPEG: starts with FF D8 FF
			if len(buf) >= 3 && buf[0] == 0xFF && buf[1] == 0xD8 && buf[2] == 0xFF {
				isValid = true
			}
		case strings.HasSuffix(strings.ToLower(file.Filename), ".png"):
			// PNG: starts with 89 50 4E 47
			if len(buf) >= 4 && buf[0] == 0x89 && buf[1] == 0x50 && buf[2] == 0x4E && buf[3] == 0x47 {
				isValid = true
			}
		case strings.HasSuffix(strings.ToLower(file.Filename), ".pdf"):
			// PDF: starts with 25 50 44 46 (%)
			if len(buf) >= 4 && buf[0] == 0x25 && buf[1] == 0x50 && buf[2] == 0x44 && buf[3] == 0x46 {
				isValid = true
			}
		}

		if !isValid {
			c.JSON(http.StatusBadRequest, gin.H{"code": 40005, "data": nil, "message": "file content does not match extension"})
			return
		}

		// Create directory structure: assets/clinic_files/{tenant_id}/{visit_id}/
		assetDir := fmt.Sprintf("assets/clinic_files/%d/%d", tenantID, visitID)
		if err := os.MkdirAll(assetDir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to create upload directory"})
			return
		}

		// Generate filename: {timestamp}-{original_filename}
		timestamp := time.Now().Unix()
		filename := fmt.Sprintf("%d-%s", timestamp, file.Filename)
		filepath := filepath.Join(assetDir, filename)

		// Save file
		if err := c.SaveUploadedFile(file, filepath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to save file"})
			return
		}

		// Create file URL (relative path for storage)
		fileURL := fmt.Sprintf("assets/clinic_files/%d/%d/%s", tenantID, visitID, filename)

		// Determine file type from MIME type
		fileType := "unknown"
		switch {
		case strings.HasSuffix(strings.ToLower(file.Filename), ".jpg") || strings.HasSuffix(strings.ToLower(file.Filename), ".jpeg"):
			fileType = "image/jpeg"
		case strings.HasSuffix(strings.ToLower(file.Filename), ".png"):
			fileType = "image/png"
		case strings.HasSuffix(strings.ToLower(file.Filename), ".pdf"):
			fileType = "application/pdf"
		}

		// Create database record
		visitFile := models.ClinicVisitFile{
			VisitID:    visitID,
			TenantID:   tenantID,
			FileName:   file.Filename,
			FileURL:    fileURL,
			FileSize:   file.Size,
			FileType:   fileType,
			UploadedAt: time.Now(),
			CreatedAt:  time.Now(),
		}

		if err := db.Create(&visitFile).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 50001, "data": nil, "message": "failed to save file record"})
			return
		}

		response := UploadVisitFileResponse{
			ID:         visitFile.ID,
			FileName:   visitFile.FileName,
			FileURL:    visitFile.FileURL,
			FileSize:   visitFile.FileSize,
			FileType:   visitFile.FileType,
			UploadedAt: visitFile.UploadedAt.Format(time.RFC3339),
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "data": response, "message": "file uploaded successfully"})
	}
}

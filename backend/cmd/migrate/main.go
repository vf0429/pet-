package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"pawrd-merchant-backend/ezyvet"
	"pawrd-merchant-backend/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	// ── Flags ──────────────────────────────────────────────────────────────────
	dryRun := flag.Bool("dry-run", false, "Print what would be imported without writing to DB")
	clientID := flag.String("client-id", os.Getenv("EZYVET_CLIENT_ID"), "ezyVet client_id")
	clientSecret := flag.String("client-secret", os.Getenv("EZYVET_CLIENT_SECRET"), "ezyVet client_secret")
	siteUID := flag.String("site-uid", os.Getenv("EZYVET_SITE_UID"), "ezyVet site_uid")
	baseURL := flag.String("base-url", "https://api.ezyvet.com", "ezyVet API base URL (use https://api.trial.ezyvet.com for sandbox)")
	tenantID := flag.Uint("tenant-id", 0, "Pawrd Merchant tenant ID to import into (required)")
	dbPath := flag.String("db", "pawrd.db", "SQLite database path")
	stepFlag := flag.String("step", "all", "Run a specific step: all|staff|clients|patients|appointments|visits|pharmacy|prescriptions|treatments|reminders")
	flag.Parse()

	// ── Validation ─────────────────────────────────────────────────────────────
	if *tenantID == 0 {
		log.Fatal("--tenant-id is required")
	}
	if *clientID == "" || *clientSecret == "" || *siteUID == "" {
		log.Fatal("ezyVet credentials required: set --client-id, --client-secret, --site-uid (or EZYVET_CLIENT_ID, EZYVET_CLIENT_SECRET, EZYVET_SITE_UID env vars)")
	}

	if *dryRun {
		log.Println("🔍 DRY RUN MODE — no data will be written to the database")
	}

	// ── Database ───────────────────────────────────────────────────────────────
	gormLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		logger.Config{SlowThreshold: 5 * time.Second, LogLevel: logger.Warn},
	)
	db, err := gorm.Open(sqlite.Open(*dbPath), &gorm.Config{Logger: gormLogger})
	if err != nil {
		log.Fatalf("failed to open database %s: %v", *dbPath, err)
	}
	log.Printf("✅ connected to database: %s", *dbPath)

	// Verify tenant exists
	var tenant models.Tenant
	if err := db.First(&tenant, *tenantID).Error; err != nil {
		log.Fatalf("tenant %d not found in database: %v", *tenantID, err)
	}
	log.Printf("✅ tenant: %s (id=%d, type=%s)", tenant.Name, tenant.ID, tenant.Type)

	// ── ezyVet client ──────────────────────────────────────────────────────────
	cfg := ezyvet.Config{
		BaseURL:      *baseURL,
		ClientID:     *clientID,
		ClientSecret: *clientSecret,
		SiteUID:      *siteUID,
		TenantID:     *tenantID,
	}
	client := ezyvet.NewClient(cfg)

	if err := client.EnsureToken(); err != nil {
		log.Fatalf("❌ ezyVet authentication failed: %v", err)
	}
	log.Println("✅ ezyVet authentication successful")

	// ── Lookup tables ──────────────────────────────────────────────────────────
	log.Println("📋 loading lookup tables from ezyVet...")
	lookup, err := ezyvet.LoadLookupTables(client, db)
	if err != nil {
		log.Fatalf("❌ failed to load lookup tables: %v", err)
	}
	log.Printf("✅ lookup tables loaded: %d species, %d breeds, %d sex types",
		len(lookup.Species), len(lookup.Breeds), len(lookup.SexNames))

	// ── Migration steps ────────────────────────────────────────────────────────
	type stepResult struct {
		name     string
		imported int
		skipped  int
		err      error
		duration time.Duration
	}
	var results []stepResult

	run := func(name string, fn func() (int, int, error)) {
		if *stepFlag != "all" && *stepFlag != name {
			return
		}
		log.Printf("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		log.Printf("▶ Step: %s", name)
		start := time.Now()
		imp, skip, e := fn()
		dur := time.Since(start)
		results = append(results, stepResult{name, imp, skip, e, dur})
		if e != nil {
			log.Printf("❌ %s FAILED: %v", name, e)
		} else {
			log.Printf("✅ %s done in %v: imported=%d skipped=%d", name, dur.Round(time.Second), imp, skip)
		}
	}

	run("staff", func() (int, int, error) {
		return ezyvet.MigrateStaff(client, db, *tenantID, *dryRun)
	})
	run("clients", func() (int, int, error) {
		return ezyvet.MigrateClients(client, db, *tenantID, *dryRun)
	})
	run("patients", func() (int, int, error) {
		return ezyvet.MigratePatients(client, db, lookup, *tenantID, *dryRun)
	})
	run("appointments", func() (int, int, error) {
		return ezyvet.MigrateAppointments(client, db, lookup, *tenantID, *dryRun)
	})
	run("visits", func() (int, int, error) {
		return ezyvet.MigrateVisits(client, db, *tenantID, *dryRun)
	})
	run("pharmacy", func() (int, int, error) {
		return ezyvet.MigratePharmacy(client, db, *tenantID, *dryRun)
	})
	run("prescriptions", func() (int, int, error) {
		return ezyvet.MigratePrescriptions(client, db, *tenantID, *dryRun)
	})
	run("treatments", func() (int, int, error) {
		return ezyvet.MigrateTreatments(client, db, *tenantID, *dryRun)
	})
	run("reminders", func() (int, int, error) {
		return ezyvet.MigrateHealthReminders(client, db, *tenantID, *dryRun)
	})

	// ── Final summary ──────────────────────────────────────────────────────────
	fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("📊 MIGRATION SUMMARY")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	totalImported, totalSkipped, hasError := 0, 0, false
	for _, r := range results {
		status := "✅"
		if r.err != nil {
			status = "❌"
			hasError = true
		}
		fmt.Printf("%s %-18s imported=%-6d skipped=%-6d time=%v\n",
			status, r.name, r.imported, r.skipped, r.duration.Round(time.Second))
		totalImported += r.imported
		totalSkipped += r.skipped
	}
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Printf("   TOTAL                imported=%-6d skipped=%d\n", totalImported, totalSkipped)
	if *dryRun {
		fmt.Println("\n⚠️  DRY RUN — nothing was written to the database")
	}
	if hasError {
		os.Exit(1)
	}
}

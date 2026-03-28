package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type analyticsEnvelope struct {
	Code    int         `json:"code"`
	Data    interface{} `json:"data"`
	Message string      `json:"message"`
}

type analyticsRange struct {
	Period    string
	FromStart time.Time
	ToEnd     time.Time
	FromDate  string
	ToDate    string
}

func analyticsOK(c *gin.Context, data interface{}) {
	c.Header("Cache-Control", "max-age=300, private")
	c.JSON(http.StatusOK, analyticsEnvelope{Code: 0, Data: data, Message: "ok"})
}

func analyticsError(c *gin.Context, status, code int, message string) {
	c.Header("Cache-Control", "max-age=300, private")
	c.JSON(status, analyticsEnvelope{Code: code, Data: nil, Message: message})
}

func resolveAnalyticsRange(c *gin.Context) (*analyticsRange, error) {
	period := c.DefaultQuery("period", "7d")
	now := time.Now().UTC()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	switch period {
	case "7d":
		fromStart := todayStart.AddDate(0, 0, -6)
		toEnd := todayStart.Add(24*time.Hour - time.Nanosecond)
		return buildAnalyticsRange(period, fromStart, toEnd)
	case "30d":
		fromStart := todayStart.AddDate(0, 0, -29)
		toEnd := todayStart.Add(24*time.Hour - time.Nanosecond)
		return buildAnalyticsRange(period, fromStart, toEnd)
	case "custom":
		dateFrom := c.Query("date_from")
		dateTo := c.Query("date_to")
		if dateFrom == "" || dateTo == "" {
			return nil, fmt.Errorf("date_from and date_to are required")
		}

		fromStart, err := time.ParseInLocation("2006-01-02", dateFrom, time.UTC)
		if err != nil {
			return nil, fmt.Errorf("invalid date range")
		}
		toStart, err := time.ParseInLocation("2006-01-02", dateTo, time.UTC)
		if err != nil {
			return nil, fmt.Errorf("invalid date range")
		}
		if toStart.Before(fromStart) {
			return nil, fmt.Errorf("invalid date range")
		}
		inclusiveDays := int(toStart.Sub(fromStart).Hours()/24) + 1
		if inclusiveDays > 90 {
			return nil, fmt.Errorf("date range exceeds 90 days")
		}
		toEnd := toStart.Add(24*time.Hour - time.Nanosecond)
		return buildAnalyticsRange(period, fromStart, toEnd)
	default:
		return nil, fmt.Errorf("invalid period")
	}
}

func buildAnalyticsRange(period string, fromStart, toEnd time.Time) (*analyticsRange, error) {
	return &analyticsRange{
		Period:    period,
		FromStart: fromStart,
		ToEnd:     toEnd,
		FromDate:  fromStart.Format("2006-01-02"),
		ToDate:    toEnd.UTC().Format("2006-01-02"),
	}, nil
}

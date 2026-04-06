package ezyvet

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Config holds ezyVet API credentials and target tenant info.
type Config struct {
	BaseURL      string // e.g. "https://api.ezyvet.com"
	ClientID     string
	ClientSecret string
	SiteUID      string
	TenantID     uint // petwell-merchant tenant to import into
}

// Client is a rate-limited, token-refreshing HTTP client for the ezyVet API.
type Client struct {
	cfg        Config
	httpClient *http.Client
	token      string
	tokenExp   time.Time
	mu         sync.Mutex
	// 55 req/min per endpoint (留 5 个余量，低于 60/min 限制)
	ticker *time.Ticker
}

func NewClient(cfg Config) *Client {
	return &Client{
		cfg:        cfg,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		ticker:     time.NewTicker(time.Minute / 55),
	}
}

// EnsureToken refreshes the OAuth2 token if expired or missing.
func (c *Client) EnsureToken() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Now().Before(c.tokenExp) {
		return nil
	}
	return c.fetchToken()
}

func (c *Client) fetchToken() error {
	form := url.Values{}
	form.Set("client_id", c.cfg.ClientID)
	form.Set("client_secret", c.cfg.ClientSecret)
	form.Set("grant_type", "client_credentials")
	form.Set("site_uid", c.cfg.SiteUID)

	resp, err := c.httpClient.PostForm(c.cfg.BaseURL+"/v1/oauth/access_token", form)
	if err != nil {
		return fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("token request returned %d: %s", resp.StatusCode, string(body))
	}

	var tr TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return fmt.Errorf("token decode failed: %w", err)
	}

	c.token = tr.AccessToken
	// Buffer: expire 2 minutes early
	expiry := tr.ExpiresIn
	if expiry == 0 {
		expiry = 43200 // 12h default
	}
	c.tokenExp = time.Now().Add(time.Duration(expiry-120) * time.Second)
	log.Printf("[ezyvet] token obtained, expires in ~%dm", expiry/60)
	return nil
}

// doGet performs a single GET request with auth header and rate limiting.
func (c *Client) doGet(path string, params url.Values) ([]byte, error) {
	if err := c.EnsureToken(); err != nil {
		return nil, err
	}

	// Rate limit
	<-c.ticker.C

	reqURL := c.cfg.BaseURL + path
	if len(params) > 0 {
		reqURL += "?" + params.Encode()
	}

	var body []byte
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			sleep := time.Duration(1<<attempt) * time.Second
			log.Printf("[ezyvet] retry %d for %s, sleeping %v", attempt, path, sleep)
			time.Sleep(sleep)
		}

		req, err := http.NewRequest(http.MethodGet, reqURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.token)
		req.Header.Set("Accept", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		body, err = io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == http.StatusTooManyRequests {
			lastErr = fmt.Errorf("rate limited (429)")
			time.Sleep(5 * time.Second)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("GET %s returned %d: %s", path, resp.StatusCode, truncate(string(body), 200))
			continue
		}
		return body, nil
	}
	return nil, fmt.Errorf("GET %s failed after 3 attempts: %w", path, lastErr)
}

// GetAll fetches all pages for a given path and returns the merged items as raw JSON.
func (c *Client) GetAll(path string, params url.Values) ([]json.RawMessage, error) {
	if params == nil {
		params = url.Values{}
	}
	params.Set("limit", "200")

	var all []json.RawMessage
	page := 1

	for {
		params.Set("page", fmt.Sprintf("%d", page))
		body, err := c.doGet(path, params)
		if err != nil {
			return nil, fmt.Errorf("page %d: %w", page, err)
		}

		// ezyVet wraps single-resource responses differently; try paged first
		var paged PagedResponse
		if err := json.Unmarshal(body, &paged); err != nil {
			return nil, fmt.Errorf("parse page %d: %w", page, err)
		}

		all = append(all, paged.Items...)
		log.Printf("[ezyvet] GET %s page %d/%d (%d items so far)",
			path, page, (paged.Meta.ItemsTotal+199)/200, len(all))

		if len(all) >= paged.Meta.ItemsTotal || len(paged.Items) == 0 {
			break
		}
		page++
	}
	return all, nil
}

// GetFiltered fetches items matching a single filter param (e.g. consult_id=123).
func (c *Client) GetFiltered(path string, key string, value string) ([]json.RawMessage, error) {
	p := url.Values{}
	p.Set(key, value)
	return c.GetAll(path, p)
}

// unwrapItem extracts the inner object from ezyVet's {"animal": {...}} wrapper.
// ezyVet wraps each item: [{"animal": {...}}, {"animal": {...}}]
func UnwrapItem(raw json.RawMessage, key string) (json.RawMessage, error) {
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return nil, err
	}
	val, ok := wrapper[key]
	if !ok {
		// Try returning raw directly (some endpoints don't wrap)
		return raw, nil
	}
	return val, nil
}

// UnwrapItems unwraps a slice of wrapped items.
func UnwrapItems[T any](raws []json.RawMessage, key string) ([]T, error) {
	out := make([]T, 0, len(raws))
	for _, raw := range raws {
		inner, err := UnwrapItem(raw, key)
		if err != nil {
			return nil, err
		}
		var item T
		if err := json.Unmarshal(inner, &item); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, nil
}

// EpochToTime converts a Unix epoch int64 to *time.Time. Returns nil if epoch is 0.
func EpochToTime(epoch int64) *time.Time {
	if epoch == 0 {
		return nil
	}
	t := time.Unix(epoch, 0).UTC()
	return &t
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// ContactDetailsFor fetches phone and email for a given contact ID.
func (c *Client) ContactDetailsFor(contactID int64) (phone, email string, err error) {
	raws, err := c.GetFiltered("/v1/contactdetail", "contact_id", fmt.Sprintf("%d", contactID))
	if err != nil {
		return "", "", err
	}
	details, err := UnwrapItems[EzContactDetail](raws, "contactdetail")
	if err != nil {
		return "", "", err
	}
	for _, d := range details {
		val := strings.TrimSpace(d.ValueCleaned)
		if val == "" {
			val = strings.TrimSpace(d.Value)
		}
		if isEmail(val) {
			if email == "" || d.Preferred == 1 {
				email = val
			}
		} else if val != "" {
			if phone == "" || d.Preferred == 1 {
				phone = val
			}
		}
	}
	return phone, email, nil
}

func isEmail(s string) bool {
	return strings.Contains(s, "@")
}

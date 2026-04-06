# Step 2 Verification

## Test Results

### 1) Missing App Key returns 40101
```bash
curl -s -X GET http://localhost:8080/app/v1/vaccinations/availability \
  -H "Content-Type: application/json" | jq .
```
```json
{
  "code": 40101,
  "data": null,
  "message": "missing app key"
}
```

### 2) Invalid App Key returns 40102
```bash
curl -s -X GET http://localhost:8080/app/v1/vaccinations/availability \
  -H "X-Merchant-App-Key: pk_app_wrong_key" | jq .
```
```json
{
  "code": 40102,
  "data": null,
  "message": "invalid app key"
}
```

### 3) Valid App Key returns 50101 stub
```bash
curl -s -X GET http://localhost:8080/app/v1/vaccinations/availability \
  -H "X-Merchant-App-Key: pk_app_test_secret_key_dev" | jq .
```
```json
{
  "code": 50101,
  "data": null,
  "message": "not implemented"
}
```

### 4) Existing merchant route still requires session
```bash
curl -s -X GET http://localhost:8080/v1/merchant/me | jq .
```
```json
{
  "error": "session_missing",
  "message": "X-Session-ID header is required."
}
```

## Status: PASS

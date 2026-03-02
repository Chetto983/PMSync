#!/usr/bin/env bash
# test-auth.sh — Reusable auth flow + endpoint testing for MailAgent backend
# Usage:
#   ./scripts/test-auth.sh                    # Just authenticate, print token
#   ./scripts/test-auth.sh GET /ai/chat/conversations
#   ./scripts/test-auth.sh POST /ai/chat '{"message":"hello"}'
#   ./scripts/test-auth.sh DELETE /ai/chat/conversations/some-id
#
# Env vars:
#   BASE_URL    — Backend URL (default: http://localhost:3000)
#   EMAIL       — Login email (default: admin@mailagent.local)
#   PASSWORD    — Login password (default: TestPassword123!)
#   TENANT_SLUG — Tenant slug (default: default)
#   MAILHOG_URL — MailHog API (default: http://localhost:8025)
#   TOKEN_FILE  — Where to cache the JWT (default: /tmp/mailagent_token.txt)
#   COOKIE_FILE — Where to store cookies (default: /tmp/mailagent_cookies.txt)
#   FORCE_LOGIN — Set to 1 to force re-login even if token exists

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="${EMAIL:-admin@mailagent.local}"
PASSWORD="${PASSWORD:-TestPassword123!}"
TENANT_SLUG="${TENANT_SLUG:-default}"
MAILHOG_URL="${MAILHOG_URL:-http://localhost:8025}"
TOKEN_FILE="${TOKEN_FILE:-/tmp/mailagent_token.txt}"
COOKIE_FILE="${COOKIE_FILE:-/tmp/mailagent_cookies.txt}"
FORCE_LOGIN="${FORCE_LOGIN:-0}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[auth]${NC} $1"; }
ok()  { echo -e "${GREEN}[OK]${NC} $1"; }
err() { echo -e "${RED}[ERR]${NC} $1" >&2; }
warn(){ echo -e "${YELLOW}[WARN]${NC} $1"; }

# Check if existing token is still valid
check_existing_token() {
  if [[ "$FORCE_LOGIN" == "1" ]]; then return 1; fi
  if [[ ! -f "$TOKEN_FILE" ]]; then return 1; fi

  local token
  token=$(cat "$TOKEN_FILE")
  if [[ -z "$token" || ${#token} -lt 50 ]]; then return 1; fi

  # Test with a GET request
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -b "$COOKIE_FILE" \
    -H "Authorization: Bearer $token" \
    "$BASE_URL/ai/chat/conversations" 2>/dev/null)

  if [[ "$status" == "200" ]]; then
    ok "Existing token is valid"
    return 0
  fi
  warn "Existing token expired (HTTP $status), re-authenticating..."
  return 1
}

# Get a fresh CSRF token
get_csrf() {
  local csrf
  csrf=$(curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" "$BASE_URL/auth/csrf-token" \
    | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).csrfToken)}catch(e){console.error('parse failed')}})" 2>/dev/null)
  if [[ -z "$csrf" ]]; then
    err "Failed to get CSRF token"
    exit 1
  fi
  echo "$csrf"
}

# Full authentication flow
authenticate() {
  log "Starting auth flow against $BASE_URL"
  rm -f "$COOKIE_FILE" "$TOKEN_FILE"

  # Step 1: CSRF token
  log "Getting CSRF token..."
  local csrf1
  csrf1=$(get_csrf)
  ok "CSRF token obtained"

  # Step 2: Login
  log "Logging in as $EMAIL (tenant: $TENANT_SLUG)..."
  local login_body
  login_body=$(node -e "console.log(JSON.stringify({email:'$EMAIL',password:'$PASSWORD',tenantSlug:'$TENANT_SLUG'}))")

  local login_result
  login_result=$(curl -s -b "$COOKIE_FILE" -c "$COOKIE_FILE" \
    -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $csrf1" \
    -d "$login_body")

  local mfa_required
  mfa_required=$(echo "$login_result" | node -e "process.stdin.on('data',d=>{try{const j=JSON.parse(d);console.log(j.mfaRequired||false)}catch{console.log('error')}})" 2>/dev/null)

  if [[ "$mfa_required" == "true" ]]; then
    ok "Login step 1 passed (MFA required)"

    # Step 3: Get OTP from MailHog
    log "Fetching OTP from MailHog..."
    sleep 1
    local otp
    otp=$(curl -s "$MAILHOG_URL/api/v2/messages?limit=1" \
      | node -e "
        process.stdin.on('data', d => {
          try {
            const j = JSON.parse(d);
            const body = j.items[0].Content.Body;
            const m = body.match(/\\b(\\d{6})\\b/);
            console.log(m ? m[1] : '');
          } catch { console.log(''); }
        });
      " 2>/dev/null)

    if [[ -z "$otp" || ${#otp} -ne 6 ]]; then
      err "Failed to extract OTP from MailHog (got: '$otp')"
      exit 1
    fi
    ok "OTP retrieved: $otp"

    # Step 4: Verify OTP
    log "Verifying OTP..."
    local csrf2
    csrf2=$(get_csrf)

    local otp_body
    otp_body=$(node -e "console.log(JSON.stringify({email:'$EMAIL',code:'$otp',tenantSlug:'$TENANT_SLUG'}))")

    local verify_result
    verify_result=$(curl -s -b "$COOKIE_FILE" -c "$COOKIE_FILE" \
      -X POST "$BASE_URL/auth/verify-otp" \
      -H "Content-Type: application/json" \
      -H "X-CSRF-Token: $csrf2" \
      -d "$otp_body")

    local token
    token=$(echo "$verify_result" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).accessToken||'')}catch{console.log('')}})" 2>/dev/null)

    if [[ -z "$token" || ${#token} -lt 50 ]]; then
      err "OTP verification failed: $verify_result"
      exit 1
    fi

    echo "$token" > "$TOKEN_FILE"
    ok "Authenticated successfully (token saved to $TOKEN_FILE)"

  elif echo "$login_result" | grep -q '"accessToken"'; then
    # No MFA, direct token
    local token
    token=$(echo "$login_result" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).accessToken||'')}catch{console.log('')}})" 2>/dev/null)
    echo "$token" > "$TOKEN_FILE"
    ok "Authenticated successfully (no MFA)"
  else
    err "Login failed: $login_result"
    exit 1
  fi
}

# Make an authenticated request
make_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  local token
  token=$(cat "$TOKEN_FILE")
  local url="$BASE_URL$path"

  log ">>> $method $url"

  local csrf=""
  # POST/PATCH/DELETE need CSRF
  if [[ "$method" != "GET" && "$method" != "HEAD" ]]; then
    csrf=$(get_csrf)
  fi

  local args=(-s -b "$COOKIE_FILE" -c "$COOKIE_FILE" -w "\n---HTTP_STATUS: %{http_code}---" \
    -X "$method" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json")

  if [[ -n "$csrf" ]]; then
    args+=(-H "X-CSRF-Token: $csrf")
  fi

  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi

  local result
  result=$(curl "${args[@]}" "$url" 2>/dev/null)

  # Extract status code
  local status
  status=$(echo "$result" | grep -oP 'HTTP_STATUS: \K\d+' | tail -1)
  local response
  response=$(echo "$result" | sed 's/\n---HTTP_STATUS: [0-9]*---$//')

  echo ""
  if [[ "$status" =~ ^2 ]]; then
    ok "HTTP $status"
  else
    err "HTTP $status"
  fi
  echo "$response" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.stringify(JSON.parse(d.toString().replace(/\\n---HTTP_STATUS.*$/,'')),null,2))}catch{process.stdout.write(d)}})" 2>/dev/null
  echo ""
}

# Main
main() {
  local method="${1:-}"
  local path="${2:-}"
  local body="${3:-}"

  # Authenticate if needed
  if ! check_existing_token; then
    authenticate
  fi

  # If no request specified, just show token info
  if [[ -z "$method" ]]; then
    local token
    token=$(cat "$TOKEN_FILE")
    echo ""
    ok "Token ready. Usage examples:"
    echo "  $0 GET /ai/chat/conversations"
    echo "  $0 POST /ai/chat '{\"message\":\"hello\"}'"
    echo "  $0 GET /contacts/counts"
    echo ""
    echo "Token (first 50 chars): ${token:0:50}..."
    echo "Cookie file: $COOKIE_FILE"
    exit 0
  fi

  make_request "$method" "$path" "$body"
}

main "$@"

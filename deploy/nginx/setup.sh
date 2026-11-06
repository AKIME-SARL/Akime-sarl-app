#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_PUBLIC_PORT=4000
readonly APP_ADMIN_PORT=4001
readonly ACME_WEBROOT=/var/www/certbot
readonly NGINX_SITE=/etc/nginx/sites-available/akime
readonly NGINX_ENABLED=/etc/nginx/sites-enabled/akime
readonly CERT_NAME=akime

log() {
  printf '\n==> %s\n' "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

prompt_value() {
  local prompt="$1"
  local value
  read -r -p "$prompt" value
  printf '%s' "$value"
}

validate_domain() {
  local domain="$1"
  [[ ${#domain} -le 253 ]] || return 1
  [[ "$domain" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]]
}

validate_email() {
  [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

confirm() {
  local prompt="$1"
  local answer
  read -r -p "$prompt [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

[[ $EUID -eq 0 ]] || die "Run this script as root: sudo bash deploy/nginx/setup.sh"
[[ -r /etc/os-release ]] || die "Cannot identify this Linux distribution."
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "ubuntu" || "${ID:-}" == "debian" ]] ||
  die "Supported distributions are Ubuntu and Debian (detected: ${PRETTY_NAME:-unknown})."
command -v apt-get >/dev/null || die "apt-get is required."
command -v systemctl >/dev/null || die "systemd is required."

public_domain="$(prompt_value 'Public website domain (e.g. akime.cm): ')"
validate_domain "$public_domain" || die "Invalid public domain."

admin_domain="$(prompt_value 'Separate admin domain (e.g. admin.akime.cm): ')"
validate_domain "$admin_domain" || die "Invalid admin domain."
[[ "${admin_domain,,}" != "${public_domain,,}" ]] ||
  die "The admin domain must be different from the public domain."

www_domain=""
if confirm "Also serve www.$public_domain?"; then
  www_domain="www.$public_domain"
  validate_domain "$www_domain" || die "Invalid www domain."
fi

email="$(prompt_value "Email for Let's Encrypt certificate notices: ")"
validate_email "$email" || die "Invalid email address."

domains=("$public_domain")
[[ -n "$www_domain" ]] && domains+=("$www_domain")
domains+=("$admin_domain")
server_names="${domains[*]}"
server_names_csv="$(IFS=,; printf '%s' "${domains[*]}")"
public_server_names="$public_domain"
[[ -n "$www_domain" ]] && public_server_names+=" $www_domain"

log "Configuration to be installed"
printf '  Public website: https://%s\n' "$public_domain"
[[ -n "$www_domain" ]] && printf '  WWW alias:      https://%s\n' "$www_domain"
printf '  Admin:          https://%s\n' "$admin_domain"
printf '  Upstreams:      127.0.0.1:%s and 127.0.0.1:%s\n' \
  "$APP_PUBLIC_PORT" "$APP_ADMIN_PORT"
printf '  Certificate:    %s\n' "$email"
printf '\nDNS for every listed hostname must resolve to this VPS, and inbound TCP 80/443 must be reachable.\n'
confirm "Continue with Nginx/Certbot installation and configuration?" ||
  die "Cancelled; no changes made."

log "Checking DNS"
for domain in "${domains[@]}"; do
  if ! getent ahosts "$domain" >/dev/null; then
    die "$domain does not currently resolve. Configure DNS, wait for propagation, then rerun."
  fi
done

log "Installing Nginx and Certbot"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx certbot
mkdir -p "$ACME_WEBROOT/.well-known/acme-challenge"

if [[ -f "$NGINX_SITE" ]]; then
  [[ ! -L "$NGINX_SITE" ]] ||
    die "$NGINX_SITE is a symlink; inspect it and make a backup before rerunning."
  backup="${NGINX_SITE}.backup.$(date +%Y%m%d%H%M%S)"
  cp -a "$NGINX_SITE" "$backup"
  log "Existing AKIME site backed up to $backup"
fi

write_bootstrap_config() {
  cat >"$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $server_names;

    location ^~ /.well-known/acme-challenge/ {
        root $ACME_WEBROOT;
        default_type text/plain;
        try_files \$uri =404;
    }

    location / {
        return 404;
    }
}
EOF
}

write_final_config() {
  cat >"$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $server_names;

    location ^~ /.well-known/acme-challenge/ {
        root $ACME_WEBROOT;
        default_type text/plain;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

  cat >>"$NGINX_SITE" <<EOF
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $public_server_names;

    ssl_certificate /etc/letsencrypt/live/$CERT_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$CERT_NAME/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PUBLIC_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_read_timeout 60s;
    }
}
EOF

  cat >>"$NGINX_SITE" <<EOF
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $admin_domain;

    ssl_certificate /etc/letsencrypt/live/$CERT_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$CERT_NAME/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:$APP_ADMIN_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_read_timeout 60s;
    }
}
EOF
}

enable_site() {
  if [[ -e "$NGINX_ENABLED" && ! -L "$NGINX_ENABLED" ]]; then
    die "$NGINX_ENABLED exists and is not a symlink; inspect it before continuing."
  fi
  ln -sfn "$NGINX_SITE" "$NGINX_ENABLED"
}

log "Installing temporary HTTP configuration for certificate issuance"
write_bootstrap_config
enable_site
nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "Requesting Let's Encrypt certificate"
certbot_args=(certonly --non-interactive --agree-tos --email "$email"
  --webroot -w "$ACME_WEBROOT" --cert-name "$CERT_NAME")
for domain in "${domains[@]}"; do
  certbot_args+=(-d "$domain")
done
certbot "${certbot_args[@]}"

log "Installing HTTPS reverse-proxy configuration"
write_final_config
nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer

if command -v ufw >/dev/null; then
  log "UFW firewall"
  printf 'The application ports %s and %s must not be public. SSH must remain allowed.\n' \
    "$APP_PUBLIC_PORT" "$APP_ADMIN_PORT"
  if confirm "Add UFW rules to allow SSH/HTTP/HTTPS and deny both Node ports?"; then
    ufw allow OpenSSH
    ufw allow 'Nginx Full'
    ufw insert 1 deny "$APP_PUBLIC_PORT/tcp"
    ufw insert 1 deny "$APP_ADMIN_PORT/tcp"
    if confirm "Enable UFW now? Confirm SSH access and the OpenSSH rule first."; then
      ufw --force enable
    fi
    ufw status
  else
    printf 'Skipped UFW changes. Restrict ports %s and %s in the provider firewall.\n' \
      "$APP_PUBLIC_PORT" "$APP_ADMIN_PORT"
  fi
else
  printf '\nUFW is not installed. Restrict ports %s and %s in the VPS/provider firewall.\n' \
    "$APP_PUBLIC_PORT" "$APP_ADMIN_PORT"
fi

log "Nginx is configured"
printf 'Public URL: https://%s\n' "$public_domain"
printf 'Admin URL:  https://%s\n' "$admin_domain"
printf '\nSet these non-secret application variables in the Node service environment:\n'
printf 'NODE_ENV=production\nPORT=%s\nADMIN_PORT=%s\nADMIN_HOST=127.0.0.1\nTRUST_PROXY=true\n' \
  "$APP_PUBLIC_PORT" "$APP_ADMIN_PORT"
printf 'BASE_URL=https://%s\nADMIN_URL=https://%s\nORIGIN=%s\n' \
  "$public_domain" "$admin_domain" "$server_names_csv"
printf '\nKeep Node ports private. Configure the provider firewall as well as the VPS firewall.\n'

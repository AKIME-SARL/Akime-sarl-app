# Nginx deployment on a VPS

This project runs Express on two private upstreams:

- Public website: `127.0.0.1:4000` through the public listener.
- Admin interface: `127.0.0.1:4001`, bound to loopback by default.

Nginx terminates HTTPS and serves separate public and admin hostnames. The
admin port must not be published directly to the internet.

## Before starting

Choose a public hostname (for example `example.com`) and a separate admin
hostname (for example `admin.example.com`). Create DNS `A` records for each
hostname pointing to the VPS IPv4 address. Add `AAAA` records only if IPv6 is
configured and reachable on the VPS.

The sample Nginx files use `example.com`, `www.example.com`, and
`admin.example.com`; replace them with your actual hostnames. The example uses
Ubuntu/Debian-style paths and commands. Adapt package commands for another
distribution.

## Automated setup

The interactive installer can configure Nginx and Certbot on an Ubuntu or
Debian VPS after DNS points to the server:

```sh
cd /path/to/akime-sarl-app
sudo bash deploy/nginx/setup.sh
```

It asks for the public hostname, separate admin hostname, optional `www`
alias, and certificate email. It checks DNS, installs Nginx/Certbot, configures
the HTTP challenge, issues a Let's Encrypt certificate, enables HTTPS proxying,
and offers to add UFW rules. Review the script before running it as root.

The installer does not configure DNS, the VPS provider's firewall, application
secrets, MongoDB, or the Node process manager. Start the app on ports 4000 and
4001 first. It prints the non-secret production environment values that must
be set for the app. If Nginx/Certbot setup fails partway through, inspect
`/etc/nginx/sites-available/akime` and the Certbot output before rerunning.

## 1. Install Nginx and Certbot

On Ubuntu or Debian:

```sh
sudo apt update
sudo apt install nginx certbot
sudo mkdir -p /var/www/certbot/.well-known/acme-challenge
```

Allow SSH before enabling a firewall. Allow only the public web ports inbound;
do not open the Node ports:

```sh
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw deny 4000/tcp
sudo ufw deny 4001/tcp
sudo ufw status
```

Enable UFW only after confirming the SSH rule and your SSH access. If the VPS
provider has a separate firewall, allow inbound TCP 80 and 443 there and block
4000 and 4001.

## 2. Issue the HTTPS certificate

Copy `deploy/nginx/akime-bootstrap.conf.example` to
`/etc/nginx/sites-available/akime`, replace all three example hostnames, enable
the site, and check Nginx:

```sh
sudo ln -s /etc/nginx/sites-available/akime /etc/nginx/sites-enabled/akime
sudo nginx -t
sudo systemctl reload nginx
```

After DNS resolves to this VPS and inbound TCP 80 is reachable, issue one
certificate covering every hostname. Use the actual names in the command:

```sh
sudo certbot certonly --webroot -w /var/www/certbot \
  --cert-name akime \
  -d example.com -d www.example.com -d admin.example.com
```

If you do not use `www`, remove that name from the Nginx files and the
certificate command. Certificate files will be under
`/etc/letsencrypt/live/akime/`.

## 3. Enable HTTPS proxying

Replace the bootstrap configuration with
`deploy/nginx/akime.conf.example`. Update its hostnames, verify that the
certificate paths match the certificate issued above, then validate and reload:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

The public hostname proxies only to port 4000. The separate admin hostname
proxies only to `127.0.0.1:4001`. The HTTP challenge path remains available
for automatic certificate renewal; all other HTTP requests redirect to HTTPS.

## 4. Configure the application

Set production environment variables for the Node service. Keep existing secret
values out of this file and out of source control:

```dotenv
NODE_ENV=production
PORT=4000
ADMIN_PORT=4001
ADMIN_HOST=127.0.0.1
SINGLE_PORT_MODE=false
TRUST_PROXY=true
BASE_URL=https://example.com
ADMIN_URL=https://admin.example.com
ORIGIN=https://example.com,https://www.example.com,https://admin.example.com
```

Also configure production MongoDB TLS, the database URI, JWT secrets, and the
other required application settings. Start Node under a process manager such as
systemd so it starts on boot and restarts after failure. Nginx assumes the app
is already listening on the two loopback upstreams. Keep `SINGLE_PORT_MODE`
false for this two-listener VPS setup.

The Node public listener binds to `0.0.0.0:4000`, so firewall rules are
important: only Nginx should be able to reach it. The admin listener should
remain bound to loopback. `TRUST_PROXY=true` is appropriate only when direct
public access to the Node ports is blocked and Nginx is the trusted proxy.

## 5. Verify deployment

On the VPS:

```sh
sudo nginx -t
sudo systemctl status nginx
sudo ss -lntp
sudo certbot renew --dry-run
```

From a machine outside the VPS, verify that the public hostname serves the
site, the admin hostname serves the login page, and ports 4000 and 4001 are
not reachable directly. Confirm the admin dashboard can call its API through
the admin hostname. Do not test by submitting destructive forms against
production data.

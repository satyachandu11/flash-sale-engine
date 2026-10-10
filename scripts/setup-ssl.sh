#!/bin/bash
# Get Let's Encrypt SSL certificates for the frontend, admin, service APIs, and Grafana.
# Run AFTER: domain DNS is pointing to this server, and port 80 is open.
# Run BEFORE the nginx container is started (this script briefly needs port 80).
# Usage: bash setup-ssl.sh fsengine.dev

set -e

DOMAIN=${1:-"fsengine.dev"}
WEBROOT=/var/www/certbot

echo "=== Setting up SSL for $DOMAIN ==="

# Certificates are issued via the webroot method so renewals keep working while nginx owns
# port 80: nginx/nginx.prod.conf serves /.well-known/acme-challenge/ from this same directory.
sudo mkdir -p $WEBROOT

# For the first issuance nginx isn't running yet, so serve the webroot from a temporary container.
docker run -d --rm --name certbot-webroot -p 80:80 -v $WEBROOT:/usr/share/nginx/html:ro nginx:1.27-alpine >/dev/null
trap 'docker stop certbot-webroot >/dev/null 2>&1 || true' EXIT

# Get certs for the root frontend plus all public subdomains
sudo certbot certonly --webroot -w $WEBROOT \
  --cert-name $DOMAIN \
  -d $DOMAIN \
  -d www.$DOMAIN \
  -d admin.$DOMAIN \
  -d order.$DOMAIN \
  -d inventory.$DOMAIN \
  -d payment.$DOMAIN \
  -d grafana.$DOMAIN \
  --agree-tos \
  --no-eff-email \
  --register-unsafely-without-email \
  --non-interactive

# Renewal: the certbot package's systemd timer (certbot.timer) runs `certbot renew` as root twice a day.
# Reload nginx after each successful renewal so it picks up the new certificate.
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\ndocker exec flashsale-nginx nginx -s reload\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo ""
echo "SSL certificates installed for:"
echo "  - $DOMAIN"
echo "  - www.$DOMAIN"
echo "  - admin.$DOMAIN"
echo "  - order.$DOMAIN"
echo "  - inventory.$DOMAIN"
echo "  - payment.$DOMAIN"
echo "  - grafana.$DOMAIN"
echo ""
echo "Auto-renewal handled by certbot.timer (check: systemctl list-timers certbot.timer)."
echo "Test renewal once nginx is up: sudo certbot renew --dry-run"

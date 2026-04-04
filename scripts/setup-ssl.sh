#!/bin/bash
# Get Let's Encrypt SSL certificates for the frontend, admin, service APIs, and Grafana.
# Run AFTER: domain DNS is pointing to this server, and port 80 is open.
# Usage: bash setup-ssl.sh fsengine.dev

set -e

DOMAIN=${1:-"fsengine.dev"}

echo "=== Setting up SSL for $DOMAIN ==="

# Get certs for the root frontend plus all public subdomains
sudo certbot certonly --standalone \
  -d $DOMAIN \
  -d www.$DOMAIN \
  -d admin.$DOMAIN \
  -d order.$DOMAIN \
  -d inventory.$DOMAIN \
  -d payment.$DOMAIN \
  -d grafana.$DOMAIN \
  --agree-tos \
  --no-eff-email \
  -m admin@$DOMAIN

# Auto-renewal cron job
(crontab -l 2>/dev/null; echo "0 12 * * * certbot renew --quiet && docker exec flashsale-nginx nginx -s reload") | crontab -

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
echo "Auto-renewal configured via cron."
echo ""
echo "Verify nginx/nginx.prod.conf references the same hostnames, then restart nginx:"
echo "  docker compose -f docker-compose.prod.yml restart nginx"

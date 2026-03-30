#!/bin/bash
# Get Let's Encrypt SSL certificates for all subdomains
# Run AFTER: domain DNS is pointing to this server, and port 80 is open
# Usage: bash setup-ssl.sh yourdomain.in

set -e

DOMAIN=${1:-"yourdomain.in"}

echo "=== Setting up SSL for $DOMAIN ==="

# Get certs for all three subdomains
sudo certbot certonly --standalone \
  -d flashsale.$DOMAIN \
  -d admin.$DOMAIN \
  -d grafana.$DOMAIN \
  --agree-tos \
  --no-eff-email \
  -m admin@$DOMAIN

# Auto-renewal cron job
(crontab -l 2>/dev/null; echo "0 12 * * * certbot renew --quiet && docker exec flashsale-nginx nginx -s reload") | crontab -

echo ""
echo "SSL certificates installed for:"
echo "  - flashsale.$DOMAIN"
echo "  - admin.$DOMAIN"
echo "  - grafana.$DOMAIN"
echo ""
echo "Auto-renewal configured via cron."
echo ""
echo "Now update nginx/nginx.prod.conf — replace YOUR_DOMAIN with $DOMAIN"
echo "Then: docker compose -f docker-compose.prod.yml restart nginx"

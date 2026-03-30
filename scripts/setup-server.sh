#!/bin/bash
# One-time Oracle VM setup script
# Run as: bash setup-server.sh
# Tested on Oracle Linux 8 / Ubuntu 22.04 (Oracle Cloud default)

set -e

echo "=== Flash Sale Engine — Server Setup ==="

# 1. Update system
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker

# 3. Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin
docker compose version

# 4. Install Certbot (for Let's Encrypt SSL)
sudo apt-get install -y certbot

# 5. Create app directory
sudo mkdir -p /opt/flash-sale-engine
sudo chown $USER:$USER /opt/flash-sale-engine

# 6. Open firewall ports (Oracle Cloud also requires Security List rules in console)
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 22 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy your project files to /opt/flash-sale-engine"
echo "2. Copy .env.prod.example to /opt/flash-sale-engine/.env and fill in values"
echo "3. Open Oracle Cloud Console → VCN → Security Lists → add ingress rules for ports 80 and 443"
echo "4. Point your domain DNS A record to this server's public IP"
echo "5. Run SSL cert setup: bash /opt/flash-sale-engine/scripts/setup-ssl.sh"
echo "6. Run: cd /opt/flash-sale-engine && docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "Log out and back in for docker group changes to take effect."

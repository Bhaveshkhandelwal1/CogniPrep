#!/bin/bash
# Script to grant CREATE DATABASE permission to MySQL user
# This fixes the Prisma Migrate shadow database issue

echo "Connecting to MySQL to grant permissions..."
echo "You'll need to enter the root password from your .env file (DB_PASSWORD)"

# Read DB credentials from .env if available
if [ -f .env ]; then
    source .env
fi

# Use root password from environment or prompt
ROOT_PASSWORD=${DB_PASSWORD:-rootpassword}
DB_USER=${DB_USER:-mysql}

echo "Granting CREATE permission to user: $DB_USER"

docker-compose exec -T db mysql -uroot -p"$ROOT_PASSWORD" <<EOF
GRANT CREATE ON *.* TO '$DB_USER'@'%';
FLUSH PRIVILEGES;
SELECT 'Permissions granted successfully!' AS status;
EOF

echo ""
echo "Done! You can now run: npm run db:migrate"


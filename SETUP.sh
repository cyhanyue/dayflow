#!/bin/bash
# Run this script from the app directory to install dependencies and initialize the database.
# Requires Node.js 18+ and npm.
set -e

cd "$(dirname "$0")"

echo "Installing npm dependencies..."
npm install

echo "Initializing Prisma database..."
npx prisma migrate dev --name init

echo "Generating Prisma client..."
npx prisma generate

echo ""
echo "Setup complete! Start the dev server with:"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000 in your browser."

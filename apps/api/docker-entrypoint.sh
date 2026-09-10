#!/bin/sh
set -e

echo "Menjalankan Prisma migrate deploy..."
npx prisma migrate deploy

echo "Menjalankan seed (aman dijalankan ulang, memakai upsert)..."
npx prisma db seed || true

echo "Starting API..."
exec node dist/main.js

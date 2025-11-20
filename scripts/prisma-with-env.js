#!/usr/bin/env node

// This script constructs DATABASE_URL from individual database environment variables
// and runs Prisma commands with it

const fs = require('fs');
const path = require('path');

// Load .env file manually
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
        process.env[key.trim()] = value.trim();
      }
    }
  });
}

// Prioritize DATABASE_URL if provided, otherwise construct from individual variables
let DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
const { DB_HOST, DB_USER, DB_PASSWORD, DB_PORT, DB_NAME } = process.env;

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_PORT || !DB_NAME) {
  console.error('Error: Missing required database environment variables');
    console.error('Either provide DATABASE_URL or all of: DB_HOST, DB_USER, DB_PASSWORD, DB_PORT, DB_NAME');
  process.exit(1);
}

// Construct DATABASE_URL from individual variables
  DATABASE_URL = `mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

// Set it in the environment
process.env.DATABASE_URL = DATABASE_URL;

// Get the Prisma command to run (e.g., 'db push', 'migrate dev', 'studio')
const prismaCommand = process.argv.slice(2);

if (prismaCommand.length === 0) {
  console.error('Error: No Prisma command provided');
  process.exit(1);
}

// Execute the Prisma command
const { spawn } = require('child_process');
const child = spawn('npx', ['prisma', ...prismaCommand], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL,
  },
});

child.on('exit', (code) => {
  process.exit(code || 0);
});


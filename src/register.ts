// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Zero-code initialization entry point.
 *
 * Import this module to auto-initialize Botanu SDK with no code changes.
 * All configuration is read from environment variables or botanu.yaml.
 *
 * Usage:
 *   node --require @botanu/sdk/register app.js
 *   node --import @botanu/sdk/register app.mjs
 *
 * Or in your package.json scripts:
 *   "start": "node --require @botanu/sdk/register dist/server.js"
 *
 * Or in Docker:
 *   CMD ["node", "--require", "@botanu/sdk/register", "dist/server.js"]
 *
 * Configuration (env vars or botanu.yaml):
 *   BOTANU_API_KEY        — API key (required for Botanu Cloud)
 *   BOTANU_SERVICE_NAME   — Service name (recommended)
 *   BOTANU_ENVIRONMENT    — Environment (default: production)
 *
 * See docs/getting-started/configuration.md for full options.
 */

import { enable } from './sdk/bootstrap.js';

const result = enable();

if (result) {
  console.info('Botanu SDK auto-initialized via @botanu/sdk/register');
}

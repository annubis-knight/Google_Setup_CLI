# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Google Setup CLI** - A Node.js CLI tool for auditing and automatically deploying Google Analytics tools (GTM, GA4, Search Console, dataLayer, Hotjar) via Google APIs.

### Core Functionality
- **Audit**: Scan domains via Google APIs to detect GTM, GA4, dataLayer, Search Console, Hotjar configuration
- **Deploy**: Automatically create GA4 properties, GTM containers, import templates, and configure tracking
- **KPI Scoring**: Calculate analytics maturity scores (0-100) with grades A+ to F

## Tech Stack

- **Runtime**: Node.js 18+ (ES Modules)
- **CLI Framework**: Commander.js + Inquirer.js
- **Google APIs**: `googleapis` package (Tag Manager v2, Analytics Admin v1alpha, Search Console v3, Site Verification v1)
- **CLI UX**: chalk, ora, cli-progress, boxen, figlet
- **HTML Parsing**: cheerio (fallback detection)

## Project Structure

```
google-setup/
├── bin/cli.js                    # CLI entry point
├── src/
│   ├── commands/                 # CLI commands (audit, deploy, export, init)
│   ├── detectors/                # API-based detection (gtm, ga4, datalayer, hotjar, search-console)
│   ├── deployers/                # API-based deployment modules
│   ├── kpi/                      # Score calculation and reporting
│   ├── utils/                    # API client, auth, file generation, template parsing
│   └── templates/                # GTM templates (JSON) and code templates
├── config/                       # Credentials and user config (gitignored)
├── reports/                      # Generated audit reports (JSON)
└── tests/
```

## KPI Scoring Weights

- GTM: 20%
- GA4: 30%
- DataLayer: 30%
- Search Console: 15%
- Hotjar: 5%

## Key APIs Used

| API | Purpose |
|-----|---------|
| Tag Manager v2 | List/create containers, tags, triggers, variables |
| Analytics Admin v1alpha | List/create GA4 properties and data streams |
| Search Console v3 | Check site verification and sitemaps |
| Site Verification v1 | Generate verification tokens |

## Template Variables

GTM templates use these placeholders that get replaced during deployment:
- `{{GA4_MEASUREMENT_ID}}` - GA4 measurement ID (G-XXXXXXXXX)
- `{{DOMAIN}}` - Site domain
- `{{PROJECT_NAME}}` - Project name

## CLI Commands

```bash
google-setup                          # Interactive mode (menu with 8 steps)
google-setup init                     # Configure API credentials
google-setup audit --domains="a.com"  # Audit domains

# Workflow (steps 1-8)
google-setup init-tracking            # [1] Initialize tracking/ folder
google-setup event-setup              # [2] Select events to track
google-setup gtm-config-setup         # [3] Generate GTM config
google-setup generate-tracking        # [4] Generate tracking.js
google-setup html-layer               # [5] Add data-track attributes
google-setup deploy --domain="a.com"  # [6] Deploy to GTM
google-setup verify-tracking          # [7] Verify production-ready
google-setup publish --domain="a.com" # [8] Publish GTM to production
```

## Publish Command (Step 8)

The `publish` command automates GTM version creation and publication:

- **Auto-versioning**: Semantic versioning (v1.0.0 → v1.0.1 → v1.0.2...)
- **Auto-description**: Generates diff of changes (tags/triggers/variables added/modified/deleted)
- **One command**: Creates version + publishes to production

```bash
google-setup publish --domain example.com
google-setup publish --gtm-id GTM-XXXXX
```

### Required OAuth Scopes

The publish feature requires these GTM scopes in `src/utils/auth.js`:
- `tagmanager.edit.containers` - Create/edit containers
- `tagmanager.edit.containerversions` - Create versions
- `tagmanager.publish` - Publish versions

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

## CLI Commands (Target)

```bash
google-setup                          # Interactive mode
google-setup audit --domains="a.com,b.com"  # Audit domains
google-setup deploy --domain="a.com" --auto # Auto-deploy missing tools
google-setup export --gtm-id=GTM-XXX        # Export GTM as template
google-setup init                           # Configure API credentials
```

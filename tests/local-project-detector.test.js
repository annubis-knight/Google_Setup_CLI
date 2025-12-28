/**
 * Tests pour local-project-detector.js
 * Vérifie la détection des events depuis le fichier YAML
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { detectFromYAML, detectLocalProject } from '../src/detectors/local-project-detector.js';

// Dossier temporaire pour les tests
const TEST_DIR = join(process.cwd(), 'test-temp-project');
const TRACKING_DIR = join(TEST_DIR, 'tracking');

describe('detectFromYAML', () => {

  beforeEach(() => {
    // Créer le dossier de test
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    if (!existsSync(TRACKING_DIR)) {
      mkdirSync(TRACKING_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Nettoyer le dossier de test
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('retourne null si le fichier YAML n\'existe pas', () => {
    const result = detectFromYAML(TEST_DIR);
    expect(result).toBeNull();
  });

  it('extrait les events enabled du YAML', () => {
    const yamlContent = `
events:
  - id: "cta_click"
    enabled: true
    datalayer:
      event_name: "clic_cta"
  - id: "form_submit"
    enabled: true
    datalayer:
      event_name: "form_submit"
  - id: "disabled_event"
    enabled: false
    datalayer:
      event_name: "should_not_appear"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    const result = detectFromYAML(TEST_DIR);

    expect(result).not.toBeNull();
    expect(result.events).toContain('clic_cta');
    expect(result.events).toContain('form_submit');
    expect(result.events).not.toContain('should_not_appear');
  });

  it('extrait les variables des params', () => {
    const yamlContent = `
events:
  - id: "cta_click"
    enabled: true
    datalayer:
      event_name: "clic_cta"
      params:
        - name: "cta_location"
        - name: "cta_text"
  - id: "form_submit"
    enabled: true
    datalayer:
      event_name: "form_submit"
      params:
        - name: "form_name"
        - name: "lead_value"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    const result = detectFromYAML(TEST_DIR);

    expect(result.variables).toContain('cta_location');
    expect(result.variables).toContain('cta_text');
    expect(result.variables).toContain('form_name');
    expect(result.variables).toContain('lead_value');
  });

  it('extrait les variables de la section variables.datalayer', () => {
    const yamlContent = `
events:
  - id: "cta_click"
    enabled: true
    datalayer:
      event_name: "clic_cta"

variables:
  datalayer:
    - name: "DLV - scroll_percent"
      datalayer_name: "scroll_percent"
    - name: "DLV - user_type"
      datalayer_name: "user_type"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    const result = detectFromYAML(TEST_DIR);

    expect(result.variables).toContain('scroll_percent');
    expect(result.variables).toContain('user_type');
  });

  it('génère la config GTM avec les noms personnalisés', () => {
    const yamlContent = `
events:
  - id: "cta_click"
    enabled: true
    datalayer:
      event_name: "clic_cta"
    gtm:
      trigger:
        name: "EV - clic_cta"
      tag:
        name: "GA4 - EV - CTA Click"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    const result = detectFromYAML(TEST_DIR);

    expect(result.gtmConfig).toHaveLength(1);
    expect(result.gtmConfig[0]).toEqual({
      event: 'clic_cta',
      triggerName: 'EV - clic_cta',
      tagName: 'GA4 - EV - CTA Click',
      consolidated: false
    });
  });

  it('utilise des noms par défaut si non spécifiés dans GTM', () => {
    const yamlContent = `
events:
  - id: "cta_click"
    enabled: true
    datalayer:
      event_name: "clic_cta"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    const result = detectFromYAML(TEST_DIR);

    expect(result.gtmConfig[0].triggerName).toBe('EV - clic_cta');
    expect(result.gtmConfig[0].tagName).toBe('GA4 - EV - clic_cta');
    expect(result.gtmConfig[0].consolidated).toBe(false);
  });

  it('ne duplique pas les variables', () => {
    const yamlContent = `
events:
  - id: "event1"
    enabled: true
    datalayer:
      event_name: "event1"
      params:
        - name: "shared_var"
  - id: "event2"
    enabled: true
    datalayer:
      event_name: "event2"
      params:
        - name: "shared_var"

variables:
  datalayer:
    - datalayer_name: "shared_var"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    const result = detectFromYAML(TEST_DIR);

    const count = result.variables.filter(v => v === 'shared_var').length;
    expect(count).toBe(1);
  });

  it('extrait les events consolidés avec leurs actions', () => {
    const yamlContent = `
events:
  - id: "simple_event"
    enabled: true
    datalayer:
      event_name: "simple_event"

consolidated_events:
  - id: "video_interaction"
    enabled: true
    consolidated: true
    actions:
      - id: "start"
        description: "Video started"
      - id: "complete"
        description: "Video completed"
    datalayer:
      event_name: "video_interaction"
      params:
        - name: "video_action"
        - name: "video_title"
    ga4:
      parameters:
        - name: "video_action"
          variable: "{{DLV - video_action}}"
        - name: "video_title"
          variable: "{{DLV - video_title}}"
    gtm:
      trigger:
        name: "EV - video_interaction"
      tag:
        name: "GA4 - EV - Video Interaction"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    const result = detectFromYAML(TEST_DIR);

    // Should have both simple and consolidated events
    expect(result.events).toContain('simple_event');
    expect(result.events).toContain('video_interaction');
    expect(result.events).toHaveLength(2);

    // Check consolidated event config
    const consolidatedConfig = result.gtmConfig.find(c => c.event === 'video_interaction');
    expect(consolidatedConfig).toBeDefined();
    expect(consolidatedConfig.consolidated).toBe(true);
    expect(consolidatedConfig.actions).toHaveLength(2);
    expect(consolidatedConfig.params).toHaveLength(2);

    // Check consolidatedEvents array
    expect(result.consolidatedEvents).toHaveLength(1);
    expect(result.consolidatedEvents[0].id).toBe('video_interaction');
    expect(result.consolidatedEvents[0].actions).toHaveLength(2);
  });

  it('extrait les variables des events consolidés', () => {
    const yamlContent = `
consolidated_events:
  - id: "faq_interaction"
    enabled: true
    datalayer:
      event_name: "faq_interaction"
      params:
        - name: "faq_action"
        - name: "faq_question"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    const result = detectFromYAML(TEST_DIR);

    expect(result.variables).toContain('faq_action');
    expect(result.variables).toContain('faq_question');
  });

});

describe('detectLocalProject', () => {

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    if (!existsSync(TRACKING_DIR)) {
      mkdirSync(TRACKING_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('retourne found: false si le YAML n\'existe pas', () => {
    const result = detectLocalProject(TEST_DIR);
    expect(result.found).toBe(false);
  });

  it('retourne found: true si le YAML existe avec des events enabled', () => {
    const yamlContent = `
events:
  - id: "cta_click"
    enabled: true
    datalayer:
      event_name: "clic_cta"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    const result = detectLocalProject(TEST_DIR);

    expect(result.found).toBe(true);
    expect(result.source).toBe('yaml');
    expect(result.dataLayerEvents).toContain('clic_cta');
  });

  it('détecte le container ID depuis gtm-head.html', () => {
    const yamlContent = `
events:
  - id: "cta_click"
    enabled: true
    datalayer:
      event_name: "clic_cta"
`;
    writeFileSync(join(TRACKING_DIR, 'gtm-tracking-plan.yml'), yamlContent);

    // Créer un fichier gtm-head.html
    const gtmHeadContent = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-ABC123');</script>
<!-- End Google Tag Manager -->`;
    writeFileSync(join(TEST_DIR, 'gtm-head.html'), gtmHeadContent);

    const result = detectLocalProject(TEST_DIR);

    expect(result.containerId).toBe('GTM-ABC123');
  });

});

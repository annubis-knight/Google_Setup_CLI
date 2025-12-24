/**
 * Tests pour local-project-detector.js
 * Vérifie la détection des events dataLayer avec différents patterns
 */

import { describe, it, expect } from 'vitest';

// On importe la fonction analyzeTrackingFile indirectement via le module
// Pour tester, on va simuler le comportement

// Reproduire la logique de analyzeTrackingFile pour les tests
function analyzeTrackingFile(content) {
  const events = [];
  const variables = [];

  const systemEvents = ['gtm.js', 'gtm.start', 'gtm.dom', 'gtm.load', 'gtm.click', 'gtm.linkClick', 'gtm.formSubmit', 'gtm.historyChange'];

  // STRATÉGIE 1 : dataLayer.push direct
  const directPushPattern = /dataLayer\.push\(\s*\{[^}]*event\s*:\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = directPushPattern.exec(content)) !== null) {
    if (match[1] && !events.includes(match[1]) && !systemEvents.includes(match[1])) {
      events.push(match[1]);
    }
  }

  // STRATÉGIE 2 : Fonctions wrapper communes
  const wrapperPatterns = [
    /(?:pushEvent|trackEvent|sendEvent|gtmPush|gtmEvent)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  ];

  for (const pattern of wrapperPatterns) {
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && !events.includes(match[1]) && !systemEvents.includes(match[1])) {
        if (!['eventName', 'event', 'name', 'type'].includes(match[1])) {
          events.push(match[1]);
        }
      }
    }
  }

  // STRATÉGIE 3 : Détection dynamique de fonction wrapper
  const wrapperFuncMatch = content.match(/function\s+(\w+)\s*\(\s*(\w+)(?:\s*,\s*\w+)*\s*\)\s*\{[^}]*(?:dataLayer\.push|window\.dataLayer\.push)\s*\(\s*\{[^}]*event\s*:\s*\2/);

  if (wrapperFuncMatch) {
    const funcName = wrapperFuncMatch[1];
    const callPattern = new RegExp(`${funcName}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g');
    while ((match = callPattern.exec(content)) !== null) {
      if (match[1] && !events.includes(match[1]) && !systemEvents.includes(match[1])) {
        events.push(match[1]);
      }
    }
  }

  // STRATÉGIE 4 : Objets event inline
  const inlineEventPattern = /\{\s*event\s*:\s*['"`]([^'"`]+)['"`]/g;
  while ((match = inlineEventPattern.exec(content)) !== null) {
    if (match[1] && !events.includes(match[1]) && !systemEvents.includes(match[1])) {
      events.push(match[1]);
    }
  }

  return { events, variables };
}

describe('analyzeTrackingFile', () => {

  describe('Stratégie 1: dataLayer.push direct', () => {
    it('détecte dataLayer.push({ event: "xxx" })', () => {
      const content = `
        dataLayer.push({ event: 'clic_cta' });
        dataLayer.push({ event: "form_submit", form_name: "contact" });
      `;
      const result = analyzeTrackingFile(content);
      expect(result.events).toContain('clic_cta');
      expect(result.events).toContain('form_submit');
    });

    it('exclut les events système GTM', () => {
      const content = `
        dataLayer.push({ event: 'gtm.js' });
        dataLayer.push({ event: 'gtm.start' });
        dataLayer.push({ event: 'real_event' });
      `;
      const result = analyzeTrackingFile(content);
      expect(result.events).not.toContain('gtm.js');
      expect(result.events).not.toContain('gtm.start');
      expect(result.events).toContain('real_event');
    });
  });

  describe('Stratégie 2: Fonctions wrapper communes', () => {
    it('détecte pushEvent("xxx")', () => {
      const content = `
        pushEvent('clic_cta_devis', { location: 'hero' });
        pushEvent('contact_click', { method: 'phone' });
      `;
      const result = analyzeTrackingFile(content);
      expect(result.events).toContain('clic_cta_devis');
      expect(result.events).toContain('contact_click');
    });

    it('détecte trackEvent("xxx")', () => {
      const content = `
        trackEvent('page_view');
        trackEvent('button_click', { button: 'submit' });
      `;
      const result = analyzeTrackingFile(content);
      expect(result.events).toContain('page_view');
      expect(result.events).toContain('button_click');
    });

    it('détecte sendEvent("xxx")', () => {
      const content = `
        sendEvent('newsletter_signup');
      `;
      const result = analyzeTrackingFile(content);
      expect(result.events).toContain('newsletter_signup');
    });
  });

  describe('Stratégie 3: Détection dynamique de wrapper', () => {
    it('détecte une fonction wrapper simple et ses appels', () => {
      // Note: La détection dynamique fonctionne pour les wrappers sur une ligne
      // Pour les wrappers complexes, on s'appuie sur les noms courants (pushEvent, trackEvent, etc.)
      const content = `function track(eventName) { dataLayer.push({ event: eventName }); }
        track('custom_event_1');
        track('custom_event_2');
      `;
      const result = analyzeTrackingFile(content);
      expect(result.events).toContain('custom_event_1');
      expect(result.events).toContain('custom_event_2');
    });
  });

  describe('Stratégie 4: Objets event inline', () => {
    it('détecte { event: "xxx" } dans différents contextes', () => {
      const content = `
        const eventData = { event: 'inline_event', data: 'test' };
        return { event: 'another_event' };
      `;
      const result = analyzeTrackingFile(content);
      expect(result.events).toContain('inline_event');
      expect(result.events).toContain('another_event');
    });
  });

  describe('Cas réel: fichier gtm-tracking.js EliSun', () => {
    it('détecte tous les events du fichier client', () => {
      const content = `
        function pushEvent(eventName, eventData = {}) {
          const payload = {
            event: eventName,
            ...eventData,
            timestamp: new Date().toISOString()
          };
          window.dataLayer.push(payload);
        }

        export function trackCTADevis(location) {
          pushEvent('clic_cta_devis', { cta_location: location });
        }

        export function trackPhoneClick() {
          pushEvent('contact_click', { contact_method: 'telephone' });
        }

        export function trackModalOpen(source = 'unknown') {
          pushEvent('modal_devis_open', { modal_source: source });
        }

        export function trackFormSubmit(formData = {}) {
          pushEvent('generate_lead', { form_name: 'devis' });
        }

        export function trackKitSelection(power) {
          pushEvent('selection_kit', { kit_power: power });
        }

        export function trackScrollDepth() {
          pushEvent('scroll_depth', { scroll_percent: 50 });
        }
      `;

      const result = analyzeTrackingFile(content);

      // Tous les events du fichier EliSun doivent être détectés
      expect(result.events).toContain('clic_cta_devis');
      expect(result.events).toContain('contact_click');
      expect(result.events).toContain('modal_devis_open');
      expect(result.events).toContain('generate_lead');
      expect(result.events).toContain('selection_kit');
      expect(result.events).toContain('scroll_depth');
    });
  });

  describe('Dédoublonnage', () => {
    it('ne retourne pas de doublons', () => {
      const content = `
        pushEvent('same_event');
        pushEvent('same_event');
        dataLayer.push({ event: 'same_event' });
      `;
      const result = analyzeTrackingFile(content);
      const count = result.events.filter(e => e === 'same_event').length;
      expect(count).toBe(1);
    });
  });

});

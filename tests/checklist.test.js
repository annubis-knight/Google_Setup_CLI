import { describe, it, expect } from 'vitest';
import { calculateProgress, getActionsForStep, getProgressSummary, STEPS } from '../src/utils/checklist.js';

describe('Checklist System', () => {

  describe('STEPS configuration', () => {
    it('contient 5 étapes', () => {
      expect(STEPS).toHaveLength(5);
    });

    it('les poids totalisent 100%', () => {
      const totalWeight = STEPS.reduce((sum, step) => sum + step.weight, 0);
      expect(totalWeight).toBe(1);
    });

    it('chaque étape a un id unique', () => {
      const ids = STEPS.map(s => s.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(STEPS.length);
    });
  });

  describe('calculateProgress', () => {
    it('retourne 0% pour un site vierge', () => {
      const auditData = {
        gtm: { installed: false },
        ga4: { installed: false },
        dataLayer: { installed: false },
        searchConsole: { verified: false },
        hotjar: { installed: false }
      };

      const progress = calculateProgress(auditData);

      expect(progress.globalProgress).toBe(0);
      expect(progress.isComplete).toBe(false);
      expect(progress.nextStep).toBeDefined();
      expect(progress.nextStep.id).toBe('ga4');
    });

    it('retourne 100% pour un site complet', () => {
      const auditData = {
        ga4: {
          installed: true,
          dataStreamId: 'stream-123',
          conversionsCount: 2
        },
        gtm: {
          installed: true,
          tags: [
            { type: 'gaawc' },
            { type: 'gaawe' },
            { type: 'gaawe' },
            { type: 'gaawe' }
          ]
        },
        dataLayer: {
          variablesCount: 6,
          customEventTriggers: 4
        },
        searchConsole: {
          verified: true,
          sitemapSubmitted: true
        },
        hotjar: {
          installed: true
        }
      };

      const progress = calculateProgress(auditData);

      expect(progress.globalProgress).toBe(100);
      expect(progress.isComplete).toBe(true);
      expect(progress.nextStep).toBeUndefined();
    });

    it('gère les dépendances correctement', () => {
      const auditData = {
        ga4: { installed: false },
        gtm: { installed: false },
        dataLayer: { installed: false },
        searchConsole: { verified: false },
        hotjar: { installed: false }
      };

      const progress = calculateProgress(auditData);

      // GTM dépend de GA4, donc GTM doit être bloqué
      const gtmStep = progress.steps.find(s => s.id === 'gtm');
      expect(gtmStep.blocked).toBe(true);

      // DataLayer dépend de GTM
      const dlStep = progress.steps.find(s => s.id === 'datalayer');
      expect(dlStep.blocked).toBe(true);

      // Search Console n'a pas de dépendance
      const scStep = progress.steps.find(s => s.id === 'search_console');
      expect(scStep.blocked).toBe(false);
    });

    it('débloque GTM quand GA4 est complet', () => {
      const auditData = {
        ga4: {
          installed: true,
          dataStreamId: 'stream-123'
        },
        gtm: { installed: false },
        dataLayer: { installed: false },
        searchConsole: { verified: false },
        hotjar: { installed: false }
      };

      const progress = calculateProgress(auditData);

      const gtmStep = progress.steps.find(s => s.id === 'gtm');
      expect(gtmStep.blocked).toBe(false);
    });

    it('calcule la progression partielle correctement', () => {
      const auditData = {
        ga4: {
          installed: true,
          dataStreamId: 'stream-123',
          conversionsCount: 0
        },
        gtm: {
          installed: true,
          tags: [{ type: 'gaawc' }] // Seulement 1 tag, pas assez d'events
        },
        dataLayer: { variablesCount: 2, customEventTriggers: 1 },
        searchConsole: { verified: true, sitemapSubmitted: false },
        hotjar: { installed: false }
      };

      const progress = calculateProgress(auditData);

      // GA4: 2/3 tasks (pas de conversions, mais c'est optionnel) = 67% mais isComplete = true
      const ga4Step = progress.steps.find(s => s.id === 'ga4');
      expect(ga4Step.isComplete).toBe(true); // Les 2 tâches requises sont faites

      // GTM: 2/3 tasks (config + 1 tag, pas assez d'events) = 67%
      const gtmStep = progress.steps.find(s => s.id === 'gtm');
      expect(gtmStep.progress).toBe(67);

      // Le score global doit être entre 0 et 100
      expect(progress.globalProgress).toBeGreaterThan(0);
      expect(progress.globalProgress).toBeLessThan(100);
    });

    it('identifie correctement le nextStep', () => {
      const auditData = {
        ga4: { installed: true, dataStreamId: 'stream-123' },
        gtm: { installed: false },
        dataLayer: { installed: false },
        searchConsole: { verified: false },
        hotjar: { installed: false }
      };

      const progress = calculateProgress(auditData);

      // GA4 est complet, donc nextStep devrait être GTM ou Search Console
      expect(['gtm', 'search_console']).toContain(progress.nextStep.id);
    });
  });

  describe('getActionsForStep', () => {
    it('retourne les actions manquantes pour GA4', () => {
      const auditData = {
        ga4: { installed: false }
      };

      const actions = getActionsForStep('ga4', auditData);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].stepId).toBe('ga4');
    });

    it('retourne un tableau vide pour une étape complète', () => {
      const auditData = {
        ga4: {
          installed: true,
          dataStreamId: 'stream-123',
          conversionsCount: 1
        }
      };

      const actions = getActionsForStep('ga4', auditData);

      // Toutes les tâches requises sont faites (conversions est optionnel)
      expect(actions).toHaveLength(0);
    });

    it('retourne un tableau vide pour une étape inexistante', () => {
      const actions = getActionsForStep('unknown', {});
      expect(actions).toHaveLength(0);
    });
  });

  describe('getProgressSummary', () => {
    it('retourne le bon message pour 0%', () => {
      const progress = {
        globalProgress: 0,
        isComplete: false,
        steps: [{}, {}, {}, {}, {}].map(() => ({ isComplete: false }))
      };

      const summary = getProgressSummary(progress);

      expect(summary).toContain('0/5');
    });

    it('retourne le bon message pour 100%', () => {
      const progress = {
        globalProgress: 100,
        isComplete: true,
        steps: [{}, {}, {}, {}, {}].map(() => ({ isComplete: true }))
      };

      const summary = getProgressSummary(progress);

      expect(summary).toContain('complète');
    });

    it('retourne le bon message pour progression partielle', () => {
      const progress = {
        globalProgress: 50,
        isComplete: false,
        steps: [
          { isComplete: true },
          { isComplete: true },
          { isComplete: false },
          { isComplete: false },
          { isComplete: false }
        ]
      };

      const summary = getProgressSummary(progress);

      expect(summary).toContain('2/5');
      expect(summary).toContain('50%');
    });
  });

  describe('Edge cases', () => {
    it('gère les données nulles/undefined', () => {
      const auditData = {
        ga4: null,
        gtm: undefined,
        dataLayer: {},
        searchConsole: null,
        hotjar: undefined
      };

      // Ne doit pas throw
      const progress = calculateProgress(auditData);

      expect(progress.globalProgress).toBe(0);
    });

    it('gère les tableaux vides', () => {
      const auditData = {
        gtm: {
          installed: true,
          tags: []
        },
        ga4: { installed: true, dataStreamId: 'x' },
        dataLayer: { variablesCount: 0 },
        searchConsole: {},
        hotjar: {}
      };

      const progress = calculateProgress(auditData);

      expect(progress).toBeDefined();
    });
  });
});

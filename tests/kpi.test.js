import { describe, it, expect } from 'vitest';
import { calculateKPI, getGrade } from '../src/kpi/calculator.js';

describe('KPI Calculator', () => {

  describe('getGrade', () => {
    it('retourne A+ pour score >= 90', () => {
      expect(getGrade(90)).toBe('A+');
      expect(getGrade(100)).toBe('A+');
    });

    it('retourne A pour score 80-89', () => {
      expect(getGrade(80)).toBe('A');
      expect(getGrade(89)).toBe('A');
    });

    it('retourne B pour score 70-79', () => {
      expect(getGrade(70)).toBe('B');
      expect(getGrade(79)).toBe('B');
    });

    it('retourne C pour score 60-69', () => {
      expect(getGrade(60)).toBe('C');
      expect(getGrade(69)).toBe('C');
    });

    it('retourne D pour score 40-59', () => {
      expect(getGrade(40)).toBe('D');
      expect(getGrade(59)).toBe('D');
    });

    it('retourne F pour score < 40', () => {
      expect(getGrade(0)).toBe('F');
      expect(getGrade(39)).toBe('F');
    });
  });

  describe('calculateKPI', () => {

    it('calcule le score correct pour un site complet (100/100)', () => {
      const auditData = {
        gtm: { installed: true, score: 100, tags: [{ type: 'gaawc' }], variablesCount: 10 },
        ga4: { installed: true, score: 100, conversionsCount: 3 },
        dataLayer: { installed: true, score: 100 },
        searchConsole: { verified: true, score: 100, sitemapSubmitted: true },
        hotjar: { installed: true, score: 100 }
      };

      const kpi = calculateKPI(auditData);

      expect(kpi.overallScore).toBe(100);
      expect(kpi.grade).toBe('A+');
      expect(kpi.recommendations.length).toBe(0);
    });

    it('calcule le score correct pour un site vide (0/100)', () => {
      const auditData = {
        gtm: { installed: false, score: 0 },
        ga4: { installed: false, score: 0 },
        dataLayer: { installed: false, score: 0 },
        searchConsole: { verified: false, score: 0 },
        hotjar: { installed: false, score: 0 }
      };

      const kpi = calculateKPI(auditData);

      expect(kpi.overallScore).toBe(0);
      expect(kpi.grade).toBe('F');
      expect(kpi.recommendations.length).toBeGreaterThan(0);
    });

    it('applique les bonnes pondérations (50 partout = 50)', () => {
      const auditData = {
        gtm: { installed: true, score: 50, tags: [{ type: 'gaawc' }], variablesCount: 5 },
        ga4: { installed: true, score: 50, conversionsCount: 1 },
        dataLayer: { installed: true, score: 50 },
        searchConsole: { verified: true, score: 50, sitemapSubmitted: true },
        hotjar: { installed: true, score: 50 }
      };

      const kpi = calculateKPI(auditData);

      // GTM: 50 * 0.20 = 10
      // GA4: 50 * 0.30 = 15
      // DataLayer: 50 * 0.30 = 15
      // Search Console: 50 * 0.15 = 7.5
      // Hotjar: 50 * 0.05 = 2.5
      // Total: 50
      expect(kpi.overallScore).toBe(50);
      expect(kpi.grade).toBe('D');
    });

    it('génère les recommandations appropriées', () => {
      const auditData = {
        gtm: { installed: true, score: 50, tags: [], variablesCount: 2 },
        ga4: { installed: true, score: 40, conversionsCount: 0 },
        dataLayer: { installed: false, score: 0 },
        searchConsole: { verified: false, score: 0 },
        hotjar: { installed: false, score: 0 }
      };

      const kpi = calculateKPI(auditData);

      // Vérifier que les recommandations critiques sont en premier
      expect(kpi.recommendations[0].priority).toBe('critical');

      // Vérifier les recommandations attendues
      const categories = kpi.recommendations.map(r => r.category);
      expect(categories).toContain('gtm'); // Pas de balise GA4
      expect(categories).toContain('datalayer'); // Pas de dataLayer
      expect(categories).toContain('search_console'); // Non vérifié
    });

    it('gère les données manquantes gracieusement', () => {
      const auditData = {};

      const kpi = calculateKPI(auditData);

      expect(kpi.overallScore).toBe(0);
      expect(kpi.grade).toBe('F');
    });

  });

});

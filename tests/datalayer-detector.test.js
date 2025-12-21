import { describe, it, expect } from 'vitest';
import { detectDataLayer } from '../src/detectors/datalayer-detector.js';

describe('DataLayer Detector', () => {

  it('retourne non installé si GTM non installé', () => {
    const gtmData = { installed: false };
    const result = detectDataLayer(gtmData);

    expect(result.installed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('retourne non installé si aucune variable dataLayer', () => {
    const gtmData = {
      installed: true,
      variables: [],
      triggers: []
    };
    const result = detectDataLayer(gtmData);

    expect(result.installed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('détecte les variables dataLayer', () => {
    const gtmData = {
      installed: true,
      variables: [
        { name: 'DLV - cta_location', type: 'v' },
        { name: 'DLV - form_name', type: 'v' },
        { name: 'Other Variable', type: 'c' } // Constant, pas dataLayer
      ],
      triggers: []
    };
    const result = detectDataLayer(gtmData);

    expect(result.installed).toBe(true);
    expect(result.variablesCount).toBe(2);
    expect(result.variables).toContain('DLV - cta_location');
    expect(result.variables).toContain('DLV - form_name');
  });

  it('calcule le score correctement', () => {
    const gtmData = {
      installed: true,
      variables: [
        { name: 'DLV - 1', type: 'v' },
        { name: 'DLV - 2', type: 'v' },
        { name: 'DLV - 3', type: 'v' },
        { name: 'DLV - 4', type: 'v' },
        { name: 'DLV - 5', type: 'v' },
        { name: 'DLV - 6', type: 'v' }
      ],
      triggers: [
        { name: 'Event 1', type: 'customEvent' },
        { name: 'Event 2', type: 'customEvent' },
        { name: 'Event 3', type: 'customEvent' },
        { name: 'Event 4', type: 'customEvent' }
      ]
    };
    const result = detectDataLayer(gtmData);

    // Base: 30 + (6 * 10 = 60) + 10 (>3 triggers) = 100
    expect(result.score).toBe(100);
    expect(result.customEventTriggers).toBe(4);
  });

  it('plafonne le score à 100', () => {
    const gtmData = {
      installed: true,
      variables: Array(10).fill({ name: 'DLV', type: 'v' }), // 10 variables
      triggers: Array(5).fill({ name: 'Event', type: 'customEvent' })
    };
    const result = detectDataLayer(gtmData);

    expect(result.score).toBeLessThanOrEqual(100);
  });

});

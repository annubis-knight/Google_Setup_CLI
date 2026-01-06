/**
 * Validation des prérequis pour chaque étape du workflow
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Vérifie si l'étape 1 (init-tracking) a été complétée correctement
 * @param {string} projectPath - Chemin du projet
 * @returns {Object} { completed: boolean, reason: string }
 */
export function isStep1Completed(projectPath = process.cwd()) {
  const googleSetupPath = join(projectPath, '.google-setup.json');

  if (!existsSync(googleSetupPath)) {
    return {
      completed: false,
      reason: 'Exécutez d\'abord: google-setup init-tracking'
    };
  }

  // Vérifier que le fichier contient les champs requis
  try {
    const config = JSON.parse(readFileSync(googleSetupPath, 'utf8'));
    if (!config.projectName || !config.domain) {
      return {
        completed: false,
        reason: '.google-setup.json incomplet. Relancez: google-setup init-tracking'
      };
    }
  } catch (e) {
    return {
      completed: false,
      reason: '.google-setup.json corrompu. Relancez: google-setup init-tracking'
    };
  }

  return { completed: true, reason: '' };
}

/**
 * Vérifie si l'étape 3 (gtm-config-setup) a été complétée
 * @param {string} projectPath - Chemin du projet
 * @returns {Object} { completed: boolean, reason: string }
 */
export function isStep3Completed(projectPath = process.cwd()) {
  const step1 = isStep1Completed(projectPath);
  if (!step1.completed) return step1;

  const gtmConfigPath = join(projectPath, 'tracking', 'gtm-config.yaml');
  if (!existsSync(gtmConfigPath)) {
    return {
      completed: false,
      reason: 'Exécutez d\'abord: google-setup gtm-config-setup'
    };
  }

  return { completed: true, reason: '' };
}

/**
 * Vérifie si l'étape 6 (verify-tracking) a été passée
 * Note: Pour l'instant, on vérifie juste que gtm-config existe
 * On pourrait ajouter un flag dans .google-setup.json plus tard
 * @param {string} projectPath - Chemin du projet
 * @returns {Object} { completed: boolean, reason: string }
 */
export function isStep6Completed(projectPath = process.cwd()) {
  return isStep3Completed(projectPath);
}

/**
 * Retourne l'état de toutes les étapes
 * @param {string} projectPath - Chemin du projet
 * @returns {Object} { step1: boolean, steps2to5: boolean, step6: boolean, steps7to8: boolean }
 */
export function getStepsStatus(projectPath = process.cwd()) {
  const step1 = isStep1Completed(projectPath);
  const step3 = isStep3Completed(projectPath);
  const step6 = isStep6Completed(projectPath);

  return {
    step1: step1.completed,
    steps2to5: step1.completed,
    step6: step3.completed,      // verify-tracking disponible après étape 3
    steps7to8: step6.completed   // create-gtm + publish après verify
  };
}

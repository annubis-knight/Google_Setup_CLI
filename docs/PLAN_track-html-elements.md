# Plan d'Implémentation : `track-html-elements`

## Vue d'Ensemble

**Objectif** : Implémenter la commande `track-html-elements` pour le CLI google-setup.

**Documents de référence** :
- [CDC_commande_track-html-elements.md](./CDC_commande_track-html-elements.md) - Spécifications détaillées
- [PRD_track-html-elements.md](./PRD_track-html-elements.md) - Résumé des décisions

---

## Architecture des Fichiers

### Fichiers à Créer

```
src/
├── commands/
│   └── track-html-elements.js    # Commande principale CLI
├── analyzers/
│   └── rule-evaluator.js         # Moteur d'évaluation des règles
└── templates/
    └── tracking-rules.yaml       # Template par défaut des règles
```

### Fichiers à Modifier

```
bin/cli.js                        # Ajouter la commande
src/commands/interactive.js       # Ajouter au menu interactif
```

---

## Phases d'Implémentation

### Phase 1 : Fondations

#### 1.1 Créer `src/templates/tracking-rules.yaml`

Template par défaut avec les rulesets de base.

```yaml
# TRACKING RULES - Règles de détection automatique
# Utilisé par: google-setup track-html-elements

rulesets:
  primary_button:
    target_tags: ["button", "a", "div"]
    visual_rules:
      - rule: "text_contains_action_verb_strong"
        patterns: ["commencer", "démarrer", "essayer", "lancer", "start", "try", "get started"]
        weight: 15
      - rule: "in_critical_section"
        patterns: ["hero", "header", "main-cta", "banner", "above-fold"]
        weight: 15
      - rule: "is_isolated_button"
        weight: 10
    html_rules:
      - rule: "has_class_pattern"
        patterns: ["btn-primary", "button-primary", "cta-primary", "primary"]
        weight: 15
      - rule: "has_class_prefix"
        patterns: ["btn-", "button-", "cta-"]
        weight: 10
      - rule: "has_id_pattern"
        patterns: ["btn-cta", "cta-", "action-", "primary-btn"]
        weight: 10
      - rule: "no_outline_style"
        patterns: ["outline", "ghost", "link", "text"]
        inverse: true
        weight: 10
    combined_rules:
      - condition: "in_critical_section AND text_contains_action_verb"
        bonus_weight: 10
    confidence_thresholds:
      very_high: 90
      high: 70
      medium: 50
      low: 30

  secondary_button:
    target_tags: ["button", "a"]
    visual_rules:
      - rule: "text_contains_action_verb_medium"
        patterns: ["découvrir", "explorer", "voir", "consulter", "learn more", "en savoir plus"]
        weight: 15
      - rule: "in_secondary_section"
        patterns: ["features", "services", "about", "content", "body"]
        weight: 10
      - rule: "has_sibling_buttons"
        weight: 10
    html_rules:
      - rule: "has_class_pattern"
        patterns: ["btn-secondary", "button-secondary", "btn-outline", "ghost", "link-btn"]
        weight: 15
      - rule: "has_outline_style"
        patterns: ["outline", "ghost", "bordered", "transparent"]
        weight: 15
    confidence_thresholds:
      very_high: 90
      high: 70
      medium: 50
      low: 30
```

**Livrables** :
- [ ] Fichier `src/templates/tracking-rules.yaml` créé

---

#### 1.2 Créer `src/analyzers/rule-evaluator.js`

Moteur d'évaluation des règles (cœur de la logique).

**Structure du module** :

```javascript
/**
 * Moteur d'évaluation des règles de détection
 * Utilisé par track-html-elements
 */

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Évalue un élément contre tous les rulesets
 * @param {Object} element - Métadonnées de l'élément HTML
 * @param {Object} rulesets - Rulesets depuis tracking-rules.yaml
 * @param {Array} events - Events avec ruleset depuis tracking-events.yaml
 * @returns {Object} Scores par event
 */
export function evaluateElement(element, rulesets, events) { }

/**
 * Évalue un élément contre un ruleset spécifique
 * @param {Object} element - Métadonnées de l'élément
 * @param {Object} ruleset - Un ruleset complet
 * @returns {Object} { percentage, confidence, matchedRules, missedRules }
 */
export function evaluateRuleset(element, ruleset) { }

// ============================================
// ÉVALUATION DES RÈGLES VISUELLES
// ============================================

/**
 * text_contains_* : Le texte contient un pattern
 */
function evaluateTextContains(element, rule) { }

/**
 * in_*_section : L'élément est dans une section spécifique
 */
function evaluateInSection(element, rule) { }

/**
 * is_isolated_* : L'élément est seul dans sa section
 */
function evaluateIsIsolated(element, rule) { }

/**
 * has_sibling_buttons : L'élément a des boutons voisins
 */
function evaluateHasSiblingButtons(element, rule) { }

// ============================================
// ÉVALUATION DES RÈGLES HTML
// ============================================

/**
 * has_class_pattern : Classe exacte match
 */
function evaluateClassPattern(element, rule) { }

/**
 * has_class_prefix : Classe commence par
 */
function evaluateClassPrefix(element, rule) { }

/**
 * has_id_pattern : ID contient pattern
 */
function evaluateIdPattern(element, rule) { }

/**
 * has_role : Attribut role
 */
function evaluateHasRole(element, rule) { }

/**
 * Règles inversées (no_outline_style, etc.)
 */
function evaluateInverseRule(element, rule) { }

// ============================================
// RÈGLES COMBINÉES
// ============================================

/**
 * Évalue les combined_rules et retourne le bonus
 */
function evaluateCombinedRules(element, combinedRules, results) { }

/**
 * Parse une condition "A AND B"
 */
function parseCondition(condition) { }

// ============================================
// CALCUL DU SCORE
// ============================================

/**
 * Calcule le pourcentage et le niveau de confiance
 */
function calculateScore(matchedWeight, totalWeight, thresholds) { }

/**
 * Détermine le niveau de confiance
 */
function determineConfidence(percentage, thresholds) { }

// ============================================
// RÉSOLUTION DES CONFLITS
// ============================================

/**
 * Résout les conflits quand un élément match plusieurs events
 */
export function resolveConflict(scores, events) { }
```

**Livrables** :
- [ ] Fichier `src/analyzers/rule-evaluator.js` créé
- [ ] Toutes les fonctions d'évaluation implémentées
- [ ] Tests unitaires pour chaque type de règle

---

### Phase 2 : Commande Principale

#### 2.1 Créer `src/commands/track-html-elements.js`

**Structure du module** :

```javascript
/**
 * Commande track-html-elements (Étape 6bis)
 * Injection automatique des attributs data-track
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';
import { evaluateElement, resolveConflict } from '../analyzers/rule-evaluator.js';

// ============================================
// PHASE 1 : INITIALISATION
// ============================================

/**
 * Charge et valide tracking-events.yaml
 */
function loadTrackingEvents(projectPath) { }

/**
 * Charge et valide tracking-rules.yaml
 */
function loadTrackingRules(projectPath, rulesPath) { }

/**
 * Valide la cohérence (tous les rulesets référencés existent)
 */
function validateCoherence(events, rulesets) { }

/**
 * Scanne les fichiers HTML dans le dossier
 */
function scanHtmlFiles(dirPath) { }

/**
 * Affiche le plan d'exécution et demande confirmation
 */
async function showExecutionPlan(events, rulesets, htmlFiles, options) { }

// ============================================
// PHASE 2 : EXTRACTION
// ============================================

/**
 * Parse un fichier HTML et extrait les métadonnées des éléments
 */
function extractElements(filePath, rulesets) { }

/**
 * Extrait les métadonnées d'un élément cheerio
 */
function extractElementMetadata($, el, filePath, htmlContent) { }

/**
 * Trouve la section parente d'un élément
 */
function findParentSection($, el) { }

/**
 * Compte les boutons voisins dans la même section
 */
function countSiblingButtons($, el, section) { }

/**
 * Calcule le numéro de ligne d'un élément
 */
function getLineNumber(htmlContent, element) { }

// ============================================
// PHASE 3 : SCORING
// ============================================

/**
 * Score tous les éléments contre tous les rulesets
 */
function scoreAllElements(elements, rulesets, events) { }

// ============================================
// PHASE 4 : RÉSOLUTION DES CONFLITS
// ============================================

/**
 * Attribue le meilleur event à chaque élément
 */
function assignBestEvents(elements, events, threshold) { }

// ============================================
// PHASE 5 : INJECTION
// ============================================

/**
 * Crée un backup du fichier HTML
 */
function createBackup(filePath, backupDir) { }

/**
 * Injecte les attributs data-track dans le HTML
 * IMPORTANT: Préserve l'indentation et la structure
 */
function injectDataTrackAttributes(filePath, elementsToInject) { }

/**
 * Injecte l'attribut sur une ligne spécifique
 */
function injectAttributeOnLine(lines, lineNumber, eventName, tag) { }

// ============================================
// PHASE 6 : RAPPORT
// ============================================

/**
 * Affiche le résumé console pour un fichier
 */
function displayFileResults(file, results, options) { }

/**
 * Affiche le résumé global
 */
function displayGlobalSummary(stats) { }

/**
 * Génère le rapport JSON détaillé
 */
function generateJsonReport(results, stats, outputPath) { }

/**
 * Génère le rapport Markdown (si --export)
 */
function generateMarkdownReport(results, stats, outputPath) { }

// ============================================
// COMMANDE PRINCIPALE
// ============================================

/**
 * Point d'entrée de la commande
 */
export async function runTrackHtmlElements(options) {
  // 1. Validation des options
  // 2. Chargement des configurations
  // 3. Validation de cohérence
  // 4. Scan des fichiers HTML
  // 5. Affichage du plan et confirmation
  // 6. Pour chaque fichier:
  //    - Extraction des éléments
  //    - Scoring
  //    - Résolution des conflits
  //    - Injection (si pas --dry-run)
  //    - Affichage des résultats
  // 7. Rapport final
}

/**
 * Mode interactif (appelé depuis interactive.js)
 */
export async function handleTrackHtmlElementsInteractive() { }
```

**Livrables** :
- [ ] Fichier `src/commands/track-html-elements.js` créé
- [ ] Toutes les phases implémentées
- [ ] Options CLI supportées (--dir, --threshold, --dry-run, etc.)

---

### Phase 3 : Intégration CLI

#### 3.1 Modifier `bin/cli.js`

Ajouter la nouvelle commande au CLI.

```javascript
// Ajouter l'import
import { runTrackHtmlElements } from '../src/commands/track-html-elements.js';

// Ajouter la commande (après html-layer)
program
  .command('track-html-elements')
  .description('[Étape 6bis] Injection automatique des attributs data-track')
  .option('-d, --dir <path>', 'Dossier contenant les fichiers HTML (obligatoire)')
  .option('-c, --config <path>', 'Chemin vers tracking-events.yaml')
  .option('-r, --rules <path>', 'Chemin vers tracking-rules.yaml')
  .option('-t, --threshold <level>', 'Seuil de confiance (very_high|high|medium|low)', 'high')
  .option('--dry-run', 'Simulation sans modification')
  .option('-f, --file <path>', 'Traiter un seul fichier')
  .option('-e, --export <path>', 'Exporter le rapport en Markdown')
  .option('--no-backup', 'Désactiver les backups')
  .option('-v, --verbose', 'Logs détaillés')
  .action(runTrackHtmlElements);
```

**Livrables** :
- [ ] Commande ajoutée dans `bin/cli.js`
- [ ] Toutes les options configurées

---

#### 3.2 Modifier `src/commands/interactive.js`

Ajouter l'option au menu interactif.

```javascript
// Dans le tableau choices, après html-layer:
{
  name: '6️⃣  [Étape 6] Ajouter data-track - Mode Manuel (html-layer)',
  value: 'html-layer'
},
{
  name: '6️⃣  [Étape 6bis] Ajouter data-track - Mode Auto (track-html-elements)',
  value: 'track-html-elements'
},

// Dans le switch case:
case 'track-html-elements':
  await handleTrackHtmlElementsInteractive();
  break;
```

**Livrables** :
- [ ] Option ajoutée au menu interactif
- [ ] Handler connecté

---

### Phase 4 : Tests

#### 4.1 Tests Unitaires

Fichier : `tests/rule-evaluator.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import { evaluateElement, evaluateRuleset, resolveConflict } from '../src/analyzers/rule-evaluator.js';

describe('rule-evaluator', () => {
  describe('evaluateRuleset', () => {
    it('should match text_contains rule', () => { });
    it('should match has_class_pattern rule', () => { });
    it('should apply inverse rule correctly', () => { });
    it('should calculate combined rules bonus', () => { });
    it('should return correct confidence level', () => { });
  });

  describe('resolveConflict', () => {
    it('should select higher priority event on tie', () => { });
    it('should select alphabetically on equal priority', () => { });
  });
});
```

#### 4.2 Tests d'Intégration

Fichier : `tests/track-html-elements.test.js`

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runTrackHtmlElements } from '../src/commands/track-html-elements.js';

describe('track-html-elements', () => {
  describe('dry-run mode', () => {
    it('should not modify files', () => { });
    it('should generate correct report', () => { });
  });

  describe('injection', () => {
    it('should inject data-track attribute', () => { });
    it('should preserve HTML structure', () => { });
    it('should create backup', () => { });
  });
});
```

**Livrables** :
- [ ] Tests unitaires pour rule-evaluator.js
- [ ] Tests d'intégration pour track-html-elements.js
- [ ] Tous les tests passent

---

## Ordre d'Implémentation Recommandé

```
┌─────────────────────────────────────────────────────────────┐
│ ÉTAPE 1 : Template tracking-rules.yaml                       │
│ Créer src/templates/tracking-rules.yaml                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ÉTAPE 2 : Moteur de règles                                   │
│ Créer src/analyzers/rule-evaluator.js                        │
│ - Fonctions d'évaluation (visual, html, combined)            │
│ - Calcul de score et confiance                               │
│ - Résolution des conflits                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ÉTAPE 3 : Commande principale                                │
│ Créer src/commands/track-html-elements.js                    │
│ - Phase 1: Initialisation et validation                      │
│ - Phase 2: Extraction avec cheerio                           │
│ - Phase 3: Scoring                                           │
│ - Phase 4: Résolution conflits                               │
│ - Phase 5: Injection                                         │
│ - Phase 6: Rapport                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ÉTAPE 4 : Intégration CLI                                    │
│ - Modifier bin/cli.js                                        │
│ - Modifier src/commands/interactive.js                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ÉTAPE 5 : Tests                                              │
│ - Tests unitaires rule-evaluator                             │
│ - Tests intégration track-html-elements                      │
│ - Validation manuelle                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Checklist Finale

### Fichiers Créés
- [ ] `src/templates/tracking-rules.yaml`
- [ ] `src/analyzers/rule-evaluator.js`
- [ ] `src/commands/track-html-elements.js`
- [ ] `tests/rule-evaluator.test.js`
- [ ] `tests/track-html-elements.test.js`

### Fichiers Modifiés
- [ ] `bin/cli.js` - Commande ajoutée
- [ ] `src/commands/interactive.js` - Menu mis à jour

### Fonctionnalités
- [ ] Chargement YAML (events + rules)
- [ ] Validation de cohérence
- [ ] Extraction métadonnées HTML
- [ ] Évaluation des règles visuelles
- [ ] Évaluation des règles HTML
- [ ] Calcul des règles combinées
- [ ] Calcul du score et confiance
- [ ] Résolution des conflits (priorité)
- [ ] Injection data-track (préservation indentation)
- [ ] Création de backups
- [ ] Rapport console
- [ ] Rapport JSON
- [ ] Rapport Markdown (--export)

### Options CLI
- [ ] `--dir` (obligatoire)
- [ ] `--config`
- [ ] `--rules`
- [ ] `--threshold`
- [ ] `--dry-run`
- [ ] `--file`
- [ ] `--export`
- [ ] `--no-backup`
- [ ] `--verbose`

### Tests
- [ ] Tests unitaires passent
- [ ] Tests intégration passent
- [ ] Test manuel sur projet réel

---

## Notes Techniques

### Préservation de l'Indentation HTML

L'injection doit se faire par manipulation de lignes (pas cheerio.html()) pour préserver exactement le formatage original.

```javascript
// Approche recommandée:
// 1. Lire le fichier en lignes
// 2. Identifier la ligne de l'élément
// 3. Insérer l'attribut avec regex préservant l'indentation
// 4. Réécrire le fichier
```

### Calcul du Numéro de Ligne

Cheerio ne fournit pas les numéros de ligne. Utiliser la position dans le HTML brut :

```javascript
function getLineNumber(htmlContent, elementHtml) {
  const index = htmlContent.indexOf(elementHtml);
  if (index === -1) return -1;
  return htmlContent.substring(0, index).split('\n').length;
}
```

### Structure des Backups

```
tracking/
└── backups/
    └── 20250101-203000/
        ├── index.html
        ├── about.html
        └── contact.html
```

---

## Dépendances Existantes

Toutes les dépendances sont déjà installées :
- `cheerio` - Parser HTML
- `js-yaml` - Parser YAML
- `chalk` - Couleurs console
- `inquirer` - Prompts interactifs
- `ora` - Spinners (optionnel pour UX)

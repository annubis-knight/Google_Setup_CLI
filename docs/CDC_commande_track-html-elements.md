# Cahier des Charges : Custom Command `/track-html-elements`

## Vue d'Ensemble

Custom command Claude Code pour identifier et injecter automatiquement les attributs `data-tracking-event` sur les éléments HTML en utilisant un **système de règles générique et extensible**.

**Phase 1** : Boutons (primary/secondary)  
**Phase 2+** : Formulaires, liens, vidéos, etc.

***

## Architecture : 2 Fichiers de Configuration

### Fichier 1 : tracking-config.yaml (Événements Métier)

Définit **QUOI tracker** (événements business).

```yaml
project:
  name: "mon-projet"
  gtm_container_id: "GTM-XXXXXX"
  ga4_measurement_id: "G-XXXXXXXXXX"

events:
  - event_name: "button_primary_click"
    description: "Bouton d'action principal (CTA primaire)"
    priority: 1
    ruleset: "primary_button"
    
  - event_name: "button_secondary_click"
    description: "Bouton d'action secondaire"
    priority: 2
    ruleset: "secondary_button"
```

### Fichier 2 : tracking-rules.yaml (Règles de Détection)

Définit **COMMENT détecter** les éléments à tracker.

```yaml
rulesets:
  primary_button:
    target_tags: ["button", "a", "div"]
    
    visual_rules:
      - rule: "text_contains_action_verb_strong"
        patterns: ["commencer", "démarrer", "essayer", "lancer", "start", "try"]
        weight: 15
        
      - rule: "in_critical_section"
        patterns: ["hero", "header", "main-cta", "banner"]
        weight: 15
        
      - rule: "is_isolated_button"
        description: "Seul bouton dans sa section"
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
        
      - rule: "has_role_button"
        patterns: ["button"]
        weight: 5
        
      - rule: "no_outline_style"
        description: "Pas de style outline ou ghost"
        patterns: ["outline", "ghost", "link"]
        inverse: true
        weight: 10
        
    combined_rules:
      - condition: "in_hero_section AND has_action_verb"
        bonus_weight: 10
        
    confidence_thresholds:
      very_high: 90    # ≥90% des règles matchées
      high: 70         # ≥70%
      medium: 50       # ≥50%
      low: 30          # <50%
      
  secondary_button:
    target_tags: ["button", "a", "div"]
    
    visual_rules:
      - rule: "text_contains_action_verb_medium"
        patterns: ["découvrir", "explorer", "voir", "consulter", "learn more"]
        weight: 15
        
      - rule: "in_secondary_section"
        patterns: ["features", "services", "about", "footer"]
        weight: 10
        
      - rule: "has_sibling_buttons"
        description: "Présence d'autres boutons dans la section"
        weight: 10
        
    html_rules:
      - rule: "has_class_pattern"
        patterns: ["btn-secondary", "button-secondary", "outline", "ghost", "link-btn"]
        weight: 15
        
      - rule: "has_class_prefix"
        patterns: ["btn-", "button-"]
        weight: 10
        
      - rule: "has_outline_style"
        description: "Style outline ou ghost"
        patterns: ["outline", "ghost", "bordered"]
        inverse: false
        weight: 15
        
    confidence_thresholds:
      very_high: 90
      high: 70
      medium: 50
      low: 30
```

***

## Prérequis Obligatoires

### 1. Fichiers de Configuration

**tracking-config.yaml** :
- Section `events:` avec au moins 1 événement
- Chaque événement a : `event_name`, `description`, `priority`, `ruleset`

**tracking-rules.yaml** :
- Section `rulesets:` avec rulesets référencés
- Chaque ruleset a : `target_tags`, `visual_rules`, `html_rules`, `confidence_thresholds`

### 2. Dossier HTML

L'utilisateur DOIT fournir le chemin :
```bash
/track-html-elements --dir ./public
```

### 3. Structure HTML Recommandée

Sections avec ID pour améliorer la détection de contexte :
```html
<section id="hero">
  <button>Commencer</button>
</section>
```

***

## Workflow Principal - Mode 100% Automatique

### PHASE 1 : Initialisation

#### 1.1 Charger les Configurations

```
📊 Chargement des configurations...

✓ tracking-config.yaml chargé
  → 2 événements définis
  
✓ tracking-rules.yaml chargé
  → 2 rulesets chargés (primary_button, secondary_button)
  
✓ Dossier HTML : ./public
  → 8 fichiers .html détectés
```

#### 1.2 Valider la Cohérence

```
✓ Validation de la cohérence...
  → Ruleset "primary_button" référencé dans events ✓
  → Ruleset "secondary_button" référencé dans events ✓
  → Tous les rulesets ont des seuils de confiance ✓
```

#### 1.3 Afficher le Plan d'Exécution

```markdown
📋 Plan d'exécution

**Événements à détecter** :
1. button_primary_click (priorité 1) → ruleset: primary_button
2. button_secondary_click (priorité 2) → ruleset: secondary_button

**Fichiers à traiter** : 8
- index.html
- about.html
- contact.html
[...]

**Mode** : Automatique (injection si confiance ≥ 70%)

Démarrer ? [O/n] ← Seule interaction possible
```

***

### PHASE 2 : Extraction et Analyse

#### 2.1 Scanner les Éléments HTML

Pour **chaque fichier HTML** :

1. **Parser le HTML** (cheerio, jsdom)
2. **Extraire tous les éléments potentiels**

```javascript
// Pseudo-code
const potentialElements = []

for (const ruleset of rulesets) {
  const { target_tags } = ruleset
  
  // Ex: target_tags = ["button", "a", "div"]
  const elements = $(target_tags.join(',')).toArray()
  
  potentialElements.push(...elements)
}

// Résultat : Tous les <button>, <a>, <div> du fichier
```

#### 2.2 Extraire les Métadonnées

Pour chaque élément détecté :

```javascript
{
  // Identification
  tag: "button",
  html: "<button id='btn-cta' class='btn-primary'>Commencer</button>",
  line: 23,
  file: "index.html",
  
  // Contenu
  text: "Commencer maintenant",
  textLower: "commencer maintenant",
  textWords: ["commencer", "maintenant"],
  
  // Attributs
  id: "btn-cta",
  classes: ["btn-primary", "large"],
  role: null,
  href: null,  // si <a>
  type: null,  // si <button>
  
  // Styles (inline ou computés si possible)
  inlineStyles: {},
  
  // Contexte
  section: "hero",  // ID de <section> parente
  sectionTag: "section",
  depth: 3,  // Profondeur dans l'arbre DOM
  
  // Voisins
  siblingButtons: 0,  // Autres boutons potentiels dans même section
  siblingButtonsData: [],
  
  // État
  hasTrackingAttr: false,
  existingEvent: null
}
```

***

### PHASE 3 : Application du Système de Règles

#### 3.1 Pour Chaque Élément, Tester Tous les Rulesets

```javascript
// Pseudo-code
for (const element of elements) {
  const scores = {}
  
  for (const [eventName, event] of events) {
    const ruleset = rulesets[event.ruleset]
    const score = evaluateRuleset(element, ruleset)
    
    scores[eventName] = {
      score: score,
      percentage: score.matched / score.total * 100,
      confidence: determineConfidence(score.percentage, ruleset.confidence_thresholds)
    }
  }
  
  element.scores = scores
}
```

#### 3.2 Évaluer un Ruleset

**Étapes** :

1. **Vérifier target_tags**
   - Si `element.tag` n'est pas dans `target_tags` → score = 0, SKIP

2. **Évaluer visual_rules**
3. **Évaluer html_rules**
4. **Évaluer combined_rules**
5. **Calculer le pourcentage**

***

### PHASE 3.3 : Détail des Types de Règles

#### Type 1 : Visual Rules (Règles Sémantiques/CSS)

##### Règle : text_contains_action_verb

```yaml
- rule: "text_contains_action_verb_strong"
  patterns: ["commencer", "démarrer", "essayer", "start"]
  weight: 15
```

**Évaluation** :
```javascript
function evaluateTextContains(element, rule) {
  const { patterns, weight } = rule
  const text = element.textLower
  
  for (const pattern of patterns) {
    if (text.includes(pattern)) {
      return { matched: true, weight: weight }
    }
  }
  
  return { matched: false, weight: 0 }
}
```

##### Règle : in_critical_section

```yaml
- rule: "in_critical_section"
  patterns: ["hero", "header", "main-cta"]
  weight: 15
```

**Évaluation** :
```javascript
function evaluateInSection(element, rule) {
  const { patterns, weight } = rule
  const section = element.section  // "hero"
  
  if (patterns.includes(section)) {
    return { matched: true, weight: weight }
  }
  
  return { matched: false, weight: 0 }
}
```

##### Règle : is_isolated_button

```yaml
- rule: "is_isolated_button"
  description: "Seul bouton dans sa section"
  weight: 10
```

**Évaluation** :
```javascript
function evaluateIsIsolated(element, rule) {
  const { weight } = rule
  
  if (element.siblingButtons === 0) {
    return { matched: true, weight: weight }
  }
  
  return { matched: false, weight: 0 }
}
```

***

#### Type 2 : HTML Rules (Règles Techniques)

##### Règle : has_class_pattern

```yaml
- rule: "has_class_pattern"
  patterns: ["btn-primary", "button-primary", "cta-primary"]
  weight: 15
```

**Évaluation** :
```javascript
function evaluateClassPattern(element, rule) {
  const { patterns, weight } = rule
  const classes = element.classes  // ["btn-primary", "large"]
  
  for (const pattern of patterns) {
    if (classes.includes(pattern)) {
      return { matched: true, weight: weight }
    }
  }
  
  return { matched: false, weight: 0 }
}
```

##### Règle : has_class_prefix

```yaml
- rule: "has_class_prefix"
  patterns: ["btn-", "button-", "cta-"]
  weight: 10
```

**Évaluation** :
```javascript
function evaluateClassPrefix(element, rule) {
  const { patterns, weight } = rule
  const classes = element.classes.join(' ')
  
  for (const pattern of patterns) {
    const regex = new RegExp(`\\b${pattern}\\w+`, 'i')
    if (regex.test(classes)) {
      return { matched: true, weight: weight }
    }
  }
  
  return { matched: false, weight: 0 }
}

// Exemple : classes = "btn-primary large"
// Pattern "btn-" → Match "btn-primary" ✓
```

##### Règle : Inverse Match (no_outline_style)

```yaml
- rule: "no_outline_style"
  patterns: ["outline", "ghost", "link"]
  inverse: true  # ← Match si AUCUN pattern trouvé
  weight: 10
```

**Évaluation** :
```javascript
function evaluateInverse(element, rule) {
  const { patterns, weight, inverse } = rule
  const classes = element.classes.join(' ')
  
  let found = false
  for (const pattern of patterns) {
    if (classes.includes(pattern)) {
      found = true
      break
    }
  }
  
  if (inverse) {
    // Inverse : on veut que ce soit NOT found
    if (!found) {
      return { matched: true, weight: weight }
    }
  } else {
    if (found) {
      return { matched: true, weight: weight }
    }
  }
  
  return { matched: false, weight: 0 }
}
```

***

#### Type 3 : Combined Rules (Règles Combinatoires)

```yaml
combined_rules:
  - condition: "in_hero_section AND has_action_verb"
    bonus_weight: 10
```

**Évaluation** :
```javascript
function evaluateCombinedRules(element, combinedRules, visualResults, htmlResults) {
  let bonusWeight = 0
  
  for (const rule of combinedRules) {
    const { condition, bonus_weight } = rule
    
    // Parser la condition
    // Exemple : "in_hero_section AND has_action_verb"
    const conditions = parseCondition(condition)
    
    // Vérifier si toutes les sous-conditions sont vraies
    let allMatch = true
    for (const cond of conditions) {
      if (!isConditionMet(cond, element, visualResults, htmlResults)) {
        allMatch = false
        break
      }
    }
    
    if (allMatch) {
      bonusWeight += bonus_weight
    }
  }
  
  return bonusWeight
}

function parseCondition(condition) {
  // "in_hero_section AND has_action_verb"
  // → ["in_hero_section", "has_action_verb"]
  return condition.split(' AND ').map(c => c.trim())
}

function isConditionMet(conditionName, element, visualResults, htmlResults) {
  // Vérifier si une règle avec ce nom a matché
  const allResults = [...visualResults, ...htmlResults]
  
  for (const result of allResults) {
    if (result.ruleName.includes(conditionName) && result.matched) {
      return true
    }
  }
  
  return false
}
```

***

### PHASE 3.4 : Calcul du Score Final (Système Booléen)

**Formule** : Pourcentage de règles qui ont matché

```javascript
function calculateScore(element, ruleset) {
  const allRules = [
    ...ruleset.visual_rules,
    ...ruleset.html_rules
  ]
  
  let totalWeight = 0
  let matchedWeight = 0
  
  // Évaluer toutes les règles
  for (const rule of allRules) {
    totalWeight += rule.weight
    
    const result = evaluateRule(element, rule)
    if (result.matched) {
      matchedWeight += rule.weight
    }
  }
  
  // Bonus des combined_rules
  const bonus = evaluateCombinedRules(element, ruleset.combined_rules, ...)
  matchedWeight += bonus
  totalWeight += bonus  // Le bonus augmente aussi le total possible
  
  // Pourcentage
  const percentage = (matchedWeight / totalWeight) * 100
  
  // Déterminer niveau de confiance
  const confidence = determineConfidence(percentage, ruleset.confidence_thresholds)
  
  return {
    matched: matchedWeight,
    total: totalWeight,
    percentage: percentage,
    confidence: confidence
  }
}

function determineConfidence(percentage, thresholds) {
  if (percentage >= thresholds.very_high) return 'very_high'
  if (percentage >= thresholds.high) return 'high'
  if (percentage >= thresholds.medium) return 'medium'
  return 'low'
}
```

**Exemple concret** :

```javascript
// Élément : <button class="btn-primary">Commencer</button> dans <section id="hero">

// Ruleset : primary_button
// Total possible : 100 points (somme de tous les weights)

// Règles matchées :
✓ text_contains_action_verb_strong : +15 (match "commencer")
✓ in_critical_section : +15 (section = "hero")
✓ is_isolated_button : +10 (siblingButtons = 0)
✓ has_class_pattern : +15 (class = "btn-primary")
✓ has_class_prefix : +10 (class commence par "btn-")
✗ has_id_pattern : 0 (pas d'id)
✓ has_role_button : +5 (tag = "button" a role implicite)
✓ no_outline_style : +10 (pas de classe "outline")
✓ BONUS combined_rule : +10 (in_hero AND action_verb)

// Score = 90 / 100 = 90%
// Confidence = very_high (≥90%)
```

***

### PHASE 4 : Résolution des Conflits (Ambiguïté)

#### Cas 1 : Un Élément, Plusieurs Événements avec Score Élevé

```javascript
// Exemple :
// <button>Télécharger le guide</button>

scores = {
  button_primary_click: { percentage: 75, confidence: 'high' },
  button_download: { percentage: 75, confidence: 'high' }
}
```

**Règle** : Utiliser la **priorité** définie dans `tracking-config.yaml`.

```yaml
events:
  - event_name: "button_primary_click"
    priority: 1  # ← Plus petit = plus prioritaire
    
  - event_name: "button_download"
    priority: 2
```

**Résolution** :
```javascript
function resolveConflict(scores, events) {
  // Filtrer les événements avec confiance ≥ high
  const candidates = Object.entries(scores)
    .filter(([name, score]) => score.confidence === 'high' || score.confidence === 'very_high')
  
  if (candidates.length === 0) {
    return null  // Aucun candidat
  }
  
  if (candidates.length === 1) {
    return candidates[0][0]  // Un seul candidat
  }
  
  // Plusieurs candidats : trier par priorité
  candidates.sort((a, b) => {
    const eventA = events.find(e => e.event_name === a[0])
    const eventB = events.find(e => e.event_name === b[0])
    return eventA.priority - eventB.priority  // Ascendant
  })
  
  // Retourner le plus prioritaire
  return candidates[0][0]
}
```

#### Cas 2 : Égalité Parfaite de Score ET Priorité

**Rare mais possible**.

**Action** : Logger un warning et choisir le premier par ordre alphabétique.

```javascript
⚠️ Ambiguïté non résolue : button_primary_click vs button_secondary_click
   Élément : <button>Action</button> (ligne 45, index.html)
   Score identique : 75%
   Priorité identique : 1
   → Choix par défaut : button_primary_click (ordre alphabétique)
```

***

### PHASE 5 : Injection Automatique

#### 5.1 Filtrer par Seuil de Confiance

**Seuil par défaut** : `high` (≥70%)

```javascript
const elementsToInject = elements.filter(element => {
  const bestEvent = resolveBestEvent(element, scores, events)
  if (!bestEvent) return false
  
  const score = element.scores[bestEvent]
  return score.confidence === 'high' || score.confidence === 'very_high'
})
```

**Option CLI** : Ajuster le seuil
```bash
/track-html-elements --dir ./public --threshold medium  # ≥50%
/track-html-elements --dir ./public --threshold very_high  # ≥90%
```

#### 5.2 Injecter les Attributs

Pour chaque élément validé :

```javascript
// Avant
<button id="btn-cta" class="btn-primary">Commencer</button>

// Après
<button id="btn-cta" class="btn-primary" data-tracking-event="button_primary_click">Commencer</button>
```

**Règles d'injection** :
1. Placer après les attributs `id` et `class`
2. Préserver l'indentation exacte
3. Un seul événement par élément
4. Ne pas modifier les autres attributs

#### 5.3 Créer les Backups

Avant toute modification :
```
index.html → index.html.backup-20250101-203000
```

#### 5.4 Logger les Modifications

```javascript
✅ index.html modifié

Ligne 23 : button_primary_click (95% ⭐⭐⭐⭐⭐)
  <button id="btn-cta" class="btn-primary">

Ligne 67 : button_secondary_click (72% ⭐⭐⭐⭐)
  <button class="btn-outline">
```

***

### PHASE 6 : Rapport Final Visuel

```markdown
# 📊 Rapport d'Exécution : /track-html-elements

**Date** : 2025-12-31 20:30:15
**Mode** : Automatique (seuil: high ≥70%)
**Dossier** : ./public

---

## Résumé Global

📁 **Fichiers traités** : 8
🎯 **Éléments analysés** : 47
✅ **Attributs injectés** : 12
⚠️ **Éléments ignorés** : 35 (confiance < 70%)

---

## Détail par Fichier

### 📄 index.html

**Éléments analysés** : 8
**Attributs injectés** : 3

#### ✅ Haute Confiance (3)

```
Ligne 23 │ ⭐⭐⭐⭐⭐ 95% │ button_primary_click
         │ <button id="btn-cta" class="btn-primary">Commencer</button>
         │
         │ Règles matchées : 9/10
         │ ✓ Verbe fort "commencer"
         │ ✓ Section hero
         │ ✓ Isolé
         │ ✓ Classe "btn-primary"
         │ ✓ Préfixe "btn-"
         │ ✗ Pas d'ID pattern
         │ ✓ Role button implicite
         │ ✓ Pas de style outline
         │ ✓ BONUS hero + verb
```

```
Ligne 67 │ ⭐⭐⭐⭐ 72% │ button_secondary_click
         │ <a class="btn-outline">Découvrir</a>
         │
         │ Règles matchées : 6/10
         │ ✓ Verbe moyen "découvrir"
         │ ✓ Section features
         │ ✓ Classe "btn-outline"
         │ ✓ Préfixe "btn-"
         │ ✓ Style outline
         │ ~ Autres boutons présents
```

#### ⚠️ Confiance Insuffisante (5)

```
Ligne 89 │ ⭐⭐⭐ 55% │ IGNORÉ (< 70%)
         │ <button>En savoir plus</button>
         │ Raison : Verbe faible, contexte ambigu
```

[Autres éléments ignorés...]

---

### 📄 about.html

**Éléments analysés** : 6
**Attributs injectés** : 1

[...]

---

## Statistiques par Événement

| Événement | Occurrences | Confiance Moyenne | Fichiers |
|-----------|-------------|-------------------|----------|
| button_primary_click | 5 | 88% ⭐⭐⭐⭐⭐ | index, about, services |
| button_secondary_click | 7 | 74% ⭐⭐⭐⭐ | index, about, contact |

---

## Distribution des Scores

```
⭐⭐⭐⭐⭐ (90-100%) ████████████████████ 8 éléments
⭐⭐⭐⭐   (70-89%)  ██████████ 4 éléments
⭐⭐⭐     (50-69%)  ████████████████████████ 12 éléments (ignorés)
⭐⭐       (30-49%)  ████████████ 6 éléments (ignorés)
⭐         (0-29%)   ██████████████████ 9 éléments (ignorés)
```

---

## 🚀 Prochaines Étapes

1. ✅ Générer tracking.js
   ```
   node scripts/generate-tracking-js.js
   ```

2. ✅ Synchroniser GTM
   ```
   node scripts/gtm-sync.js
   ```

3. ✅ Valider configuration
   ```
   node scripts/validate-tracking.js
   ```

---

## 💡 Recommandations

### Éléments à Réviser Manuellement

**35 éléments ignorés** (confiance < 70%) pourraient nécessiter une révision :

- **12 éléments avec score 50-69%** : Ambiguïté modérée
  → Affiner les règles dans tracking-rules.yaml
  → Ou ajouter des classes CSS explicites dans le HTML

- **Boutons "En savoir plus" répétés** : 8 occurrences détectées
  → Créer un événement dédié `button_learn_more` ?

### Amélioration des Règles

**Règles peu utilisées** :
- `has_id_pattern` : Matché dans seulement 2/47 éléments
  → Ajouter plus de patterns ou réduire le poids

**Faux négatifs potentiels** :
- 3 boutons dans footer avec score 65%
  → Ajouter règle spécifique pour footer ?

---

📝 **Logs complets** : ./logs/track-html-elements-20250101-203000.log
💾 **Backups** : ./backups/
```

***

## Syntaxe de la Commande

### Usage de Base

```bash
/track-html-elements --dir <path>
```

### Options Complètes

```bash
/track-html-elements \
  --dir ./public \                    # Dossier HTML (obligatoire)
  --config ./tracking-config.yaml \   # Chemin config (défaut: ./tracking-config.yaml)
  --rules ./tracking-rules.yaml \     # Chemin règles (défaut: ./tracking-rules.yaml)
  --threshold [very_high|high|medium|low] \  # Seuil confiance (défaut: high)
  --dry-run \                         # Simulation sans modification
  --file <path> \                     # Traiter un seul fichier
  --export <path> \                   # Exporter rapport Markdown
  --no-backup \                       # Désactiver backups (déconseillé)
  --verbose                           # Logs détaillés
```

### Exemples

```bash
# Standard : injection automatique (confiance ≥ high)
/track-html-elements --dir ./public

# Seuil très élevé : seulement confiance ≥90%
/track-html-elements --dir ./public --threshold very_high

# Seuil bas : accepter confiance ≥50%
/track-html-elements --dir ./public --threshold medium

# Simulation (voir le rapport sans modifier)
/track-html-elements --dir ./public --dry-run

# Un seul fichier
/track-html-elements --file ./index.html

# Export rapport
/track-html-elements --dir ./public --export ./rapport.md
```

***

## Extensibilité : Phase 2+ (Formulaires, Liens, etc.)

### Ajouter un Nouveau Type d'Élément

#### Étape 1 : Ajouter l'événement dans tracking-config.yaml

```yaml
events:
  - event_name: "form_submit"
    description: "Soumission d'un formulaire"
    priority: 1
    ruleset: "contact_form"
```

#### Étape 2 : Créer le ruleset dans tracking-rules.yaml

```yaml
rulesets:
  contact_form:
    target_tags: ["form"]
    
    html_rules:
      - rule: "has_id_pattern"
        patterns: ["form-contact", "contact-form", "form-quote"]
        weight: 20
        
      - rule: "contains_email_input"
        description: "Contient un champ email"
        weight: 20
        
      - rule: "contains_submit_button"
        description: "Contient un bouton submit"
        weight: 20
        
      - rule: "in_contact_section"
        patterns: ["contact", "quote", "booking"]
        weight: 15
        
    combined_rules:
      - condition: "has_email_input AND has_submit_button"
        bonus_weight: 25
        
    confidence_thresholds:
      very_high: 90
      high: 70
      medium: 50
      low: 30
```

#### Étape 3 : Exécuter la commande

```bash
/track-html-elements --dir ./public
```

**La commande détectera automatiquement** les formulaires en plus des boutons !

***

## Règles Strictes

### 1. Un Élément = Un Seul Événement

**JAMAIS** injecter plusieurs attributs `data-tracking-event` sur le même élément.

```html
❌ INTERDIT :
<button data-tracking-event="button_primary_click" data-tracking-event="conversion_click">
```

En cas de conflit, utiliser la priorité.

### 2. Cohérence YAML

**JAMAIS** injecter un événement qui n'existe pas dans `tracking-config.yaml`.

### 3. Préservation HTML

- NE PAS modifier l'indentation
- NE PAS réordonner les attributs
- NE PAS supprimer des commentaires
- NE PAS modifier le contenu textuel

### 4. Backup Obligatoire

Toujours créer un backup avant modification (sauf `--no-backup`).

### 5. Logging Complet

Toutes les décisions doivent être loggées avec justification.

***

## Gestion des Erreurs

### Erreur 1 : YAML Manquant

```
❌ Erreur : tracking-config.yaml introuvable

Chemin recherché : ./tracking-config.yaml

Actions :
1. Créer le fichier avec la structure minimale
2. Spécifier un autre chemin : --config <path>

ARRÊT de l'exécution.
```

### Erreur 2 : Ruleset Manquant

```
❌ Erreur : Ruleset "primary_button" introuvable

L'événement "button_primary_click" référence le ruleset "primary_button"
mais celui-ci n'existe pas dans tracking-rules.yaml.

Action : Ajouter le ruleset ou corriger la référence.

ARRÊT de l'exécution.
```

### Erreur 3 : HTML Invalide

```
⚠️ Avertissement : index.html contient du HTML mal formé

Ligne 45 : Balise <div> non fermée

L'élément sera ignoré mais le traitement continue.
```

### Erreur 4 : Conflit de Priorité

```
⚠️ Ambiguïté : Égalité parfaite

Élément : <button>Action</button> (ligne 67, services.html)

Événements en conflit :
- button_primary_click : 75% (priorité 1)
- button_cta_action : 75% (priorité 1)

→ Choix par défaut : button_cta_action (ordre alphabétique)

Recommandation : Ajuster les priorités dans tracking-config.yaml
```

***

## Critères de Complétion

La commande est **terminée avec succès** quand :

✅ Tous les fichiers HTML ont été analysés  
✅ Tous les éléments ont été scorés selon les rulesets  
✅ Les attributs ont été injectés (confiance ≥ seuil)  
✅ Backups créés  
✅ Rapport final généré  
✅ Logs complets écrits  

***

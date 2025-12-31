# PRD : Commande `track-html-elements`

## 1. Résumé Exécutif

### Objectif
Créer une nouvelle commande CLI `track-html-elements` qui scanne automatiquement les fichiers HTML d'un projet client, détecte les éléments trackables via un système de règles pondérées, et injecte les attributs `data-track` avec un niveau de confiance élevé.

### Problème Résolu
- **html-layer actuel** : Mode interactif, nécessite validation manuelle de chaque élément
- **track-html-elements** : Mode 100% automatique basé sur des règles configurables

### Valeur Ajoutée
- Automatisation complète du balisage HTML
- Système de scoring transparent avec rapport détaillé
- Extensible via fichiers YAML (pas de modification du code)
- Réutilise `tracking-events.yaml` existant (cohérence workflow)

---

## 2. Contexte et Motivation

### Workflow Actuel (6 étapes)
```
[1] init-tracking      → Crée tracking-events.yaml
[2] event-setup        → Sélectionne les events
[3] gtm-config-setup   → Génère gtm-config.yaml
[4] generate-tracking  → Génère tracking.js
[5] deploy             → Déploie dans GTM
[6] html-layer         → Ajoute data-track (INTERACTIF)
```

### Limitation de html-layer
- Nécessite validation manuelle pour chaque élément trouvé
- Hints basés sur des patterns simples (event_name contains "phone" → cherche `a[href^=tel:]`)
- Pas de scoring ni de niveau de confiance

### Nouvelle Approche : track-html-elements
- **Détection intelligente** via règles pondérées (visual + html + combined)
- **Scoring transparent** : 0-100% avec seuils configurables
- **Rapport détaillé** : Justification de chaque décision

---

## 3. Spécifications Fonctionnelles

### 3.1 Architecture à 2 Fichiers

#### Fichier 1 : `tracking/tracking-events.yaml` (EXISTANT - QUOI tracker)

Réutilise le fichier existant avec ajout optionnel du champ `ruleset` pour lier à une règle de détection.

```yaml
project:
  name: "mon-projet"
  gtm_container_id: "GTM-XXXXXX"
  ga4_measurement_id: "G-XXXXXXXXXX"

events:
  - event_name: "cta_primary"
    description: "CTA principal (conversion directe)"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='cta-primary']"
    ruleset: "primary_button"        # NOUVEAU : lien vers règle de détection

  - event_name: "cta_secondary"
    description: "CTA secondaire"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='cta-secondary']"
    ruleset: "secondary_button"      # NOUVEAU
```

**Note** : Le champ `ruleset` est optionnel. Les events sans `ruleset` sont ignorés par `track-html-elements`.

#### Fichier 2 : `tracking/tracking-rules.yaml` (NOUVEAU - COMMENT détecter)

```yaml
rulesets:
  primary_button:
    target_tags: ["button", "a", "div"]

    visual_rules:
      - rule: "text_contains_action_verb_strong"
        patterns: ["commencer", "démarrer", "essayer", "start"]
        weight: 15

      - rule: "in_critical_section"
        patterns: ["hero", "header", "main-cta"]
        weight: 15

    html_rules:
      - rule: "has_class_pattern"
        patterns: ["btn-primary", "button-primary", "cta-primary"]
        weight: 15

      - rule: "no_outline_style"
        patterns: ["outline", "ghost"]
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
        patterns: ["découvrir", "voir", "en savoir plus"]
        weight: 15

    html_rules:
      - rule: "has_class_pattern"
        patterns: ["btn-secondary", "btn-outline", "ghost"]
        weight: 15

    confidence_thresholds:
      very_high: 90
      high: 70
      medium: 50
      low: 30
```

### 3.2 Flux d'Exécution

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1 : Initialisation                                     │
├─────────────────────────────────────────────────────────────┤
│ 1.1 Charger tracking-events.yaml                            │
│ 1.2 Charger tracking-rules.yaml                             │
│ 1.3 Valider cohérence (rulesets référencés existent)        │
│ 1.4 Scanner fichiers HTML dans --dir                        │
│ 1.5 Afficher plan d'exécution                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2 : Extraction                                         │
├─────────────────────────────────────────────────────────────┤
│ Pour chaque fichier HTML :                                   │
│ 2.1 Parser avec cheerio                                      │
│ 2.2 Extraire éléments selon target_tags des rulesets        │
│ 2.3 Collecter métadonnées (tag, classes, text, section...)  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3 : Scoring                                            │
├─────────────────────────────────────────────────────────────┤
│ Pour chaque élément :                                        │
│ 3.1 Tester contre chaque ruleset                            │
│ 3.2 Évaluer visual_rules (texte, section, isolation)        │
│ 3.3 Évaluer html_rules (classes, id, role)                  │
│ 3.4 Calculer bonus combined_rules                           │
│ 3.5 Calculer % et niveau de confiance                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 4 : Résolution des Conflits                           │
├─────────────────────────────────────────────────────────────┤
│ Si élément match plusieurs events avec score élevé :        │
│ 4.1 Trier par priorité (tracking-config.yaml)               │
│ 4.2 En cas d'égalité → ordre alphabétique + warning         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 5 : Injection                                          │
├─────────────────────────────────────────────────────────────┤
│ Pour éléments avec confiance ≥ seuil (défaut: high):        │
│ 5.1 Créer backup du fichier                                 │
│ 5.2 Injecter data-track="event_name"               │
│ 5.3 Préserver indentation et structure                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 6 : Rapport                                            │
├─────────────────────────────────────────────────────────────┤
│ 6.1 Afficher résumé console                                 │
│ 6.2 Générer rapport détaillé (JSON + MD optionnel)          │
│ 6.3 Lister recommandations                                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Syntaxe CLI

```bash
# Usage de base
google-setup track-html-elements --dir ./public

# Options complètes
google-setup track-html-elements \
  --dir ./public \                              # Dossier HTML (obligatoire)
  --config ./tracking/tracking-config.yaml \   # Chemin config
  --rules ./tracking/tracking-rules.yaml \     # Chemin règles
  --threshold [very_high|high|medium|low] \    # Seuil (défaut: high)
  --dry-run \                                   # Simulation
  --file <path> \                               # Un seul fichier
  --export <path> \                             # Export rapport MD
  --no-backup \                                 # Sans backup
  --verbose                                     # Logs détaillés
```

### 3.4 Output Console

```
📊 track-html-elements
─────────────────────────────────────────────

✓ tracking-config.yaml chargé (2 events)
✓ tracking-rules.yaml chargé (2 rulesets)
✓ 8 fichiers HTML détectés

📋 Plan d'exécution
   Events: button_primary_click, button_secondary_click
   Seuil: high (≥70%)
   Mode: Automatique

Démarrer ? [O/n]

─────────────────────────────────────────────

📄 index.html (8 éléments analysés)

   ✅ Ligne 23 │ 95% ⭐⭐⭐⭐⭐ │ button_primary_click
      <button id="btn-cta" class="btn-primary">Commencer</button>

   ✅ Ligne 67 │ 72% ⭐⭐⭐⭐  │ button_secondary_click
      <a class="btn-outline">Découvrir</a>

   ⚠️  Ligne 89 │ 55% ⭐⭐⭐   │ IGNORÉ (< 70%)
      <button>En savoir plus</button>

─────────────────────────────────────────────

📊 Résumé

   Fichiers traités : 8
   Éléments analysés : 47
   Attributs injectés : 12
   Ignorés (< 70%) : 35

   Backups : ./tracking/backups/
   Rapport : ./tracking/debug/track-html-elements-report.json
```

---

## 4. Spécifications Techniques

### 4.1 Fichiers à Créer

| Fichier | Description |
|---------|-------------|
| `src/commands/track-html-elements.js` | Commande principale |
| `src/analyzers/rule-evaluator.js` | Moteur d'évaluation des règles |
| `src/templates/tracking-config.yaml` | Template config events |
| `src/templates/tracking-rules.yaml` | Template règles par défaut |

### 4.2 Dépendances

- `cheerio` : Parser HTML (déjà installé)
- `js-yaml` : Parser YAML (déjà installé)
- `chalk` : Output coloré (déjà installé)

### 4.3 Structure de Données Interne

```javascript
// Élément extrait
{
  file: "index.html",
  line: 23,
  tag: "button",
  html: "<button id='btn-cta' class='btn-primary'>Commencer</button>",

  // Contenu
  text: "Commencer",
  textLower: "commencer",

  // Attributs
  id: "btn-cta",
  classes: ["btn-primary"],
  role: null,
  href: null,

  // Contexte
  section: "hero",
  siblingButtons: 0,

  // Scores calculés
  scores: {
    button_primary_click: {
      percentage: 95,
      confidence: "very_high",
      matchedRules: [...],
      missedRules: [...]
    },
    button_secondary_click: {
      percentage: 45,
      confidence: "low",
      ...
    }
  },

  // Résolution
  bestEvent: "button_primary_click",
  injected: true
}
```

### 4.4 Types de Règles Supportés

| Type | Description | Exemple |
|------|-------------|---------|
| `text_contains_*` | Texte contient pattern | `["commencer", "start"]` |
| `in_*_section` | Section parent ID match | `["hero", "header"]` |
| `is_isolated_*` | Seul élément de son type | `siblingButtons === 0` |
| `has_class_pattern` | Classe exacte match | `["btn-primary"]` |
| `has_class_prefix` | Classe commence par | `["btn-", "cta-"]` |
| `has_id_pattern` | ID contient pattern | `["btn-cta"]` |
| `has_role` | Attribut role | `["button"]` |
| `inverse` | Négation | `no_outline_style` |

---

## 5. Intégration Workflow

### Position dans le Workflow

```
[1] init-tracking           → Crée tracking-events.yaml
[2] event-setup             → Sélectionne les events (+ ajoute ruleset)
[3] gtm-config-setup        → Génère gtm-config.yaml
[4] generate-tracking       → Génère tracking.js
[5] deploy                  → Déploie dans GTM
[6] html-layer              ← Mode INTERACTIF (existant)
[6bis] track-html-elements  ← Mode AUTOMATIQUE (NOUVEAU)
```

**Étape 6 vs 6bis** : L'utilisateur choisit l'une OU l'autre selon son besoin :
- `html-layer` : Contrôle fin, validation manuelle de chaque élément
- `track-html-elements` : 100% automatique, idéal pour projets volumineux

### Modification du Menu Interactif

```javascript
// interactive.js
choices: [
  // ... existing ...
  { name: '6️⃣  [Étape 6] Ajouter attributs HTML - Manuel (html-layer)', value: 'html-layer' },
  { name: '6️⃣  [Étape 6bis] Ajouter attributs HTML - Auto (track-html-elements)', value: 'track-html-elements' },
]
```

---

## 6. Gestion des Erreurs

| Erreur | Message | Action |
|--------|---------|--------|
| Config manquante | `❌ tracking-config.yaml introuvable` | STOP |
| Ruleset manquant | `❌ Ruleset "xxx" référencé mais non défini` | STOP |
| HTML invalide | `⚠️ HTML mal formé ligne X` | SKIP élément |
| Dossier vide | `⚠️ Aucun fichier .html trouvé` | STOP |
| Conflit priorité | `⚠️ Égalité score + priorité` | Warning + choix alphabétique |

---

## 7. Phase 1 : Scope Initial

### Inclus
- [x] Détection boutons (button, a, div avec classes bouton)
- [x] Règles visuelles (texte, section)
- [x] Règles HTML (classes, id, role)
- [x] Règles combinées avec bonus
- [x] Injection `data-track`
- [x] Rapport JSON + console
- [x] Backups automatiques
- [x] Options CLI (--dry-run, --threshold, etc.)

### Exclus (Phase 2+)
- [ ] Formulaires (`<form>`)
- [ ] Liens externes (`<a href="http...">`)
- [ ] Vidéos (`<video>`, iframes YouTube)
- [ ] Détection CSS (styles computés)
- [ ] Mode interactif hybride

---

## 8. Critères d'Acceptation

### Fonctionnels
- [ ] Charge et valide les 2 fichiers YAML
- [ ] Scanne tous les fichiers .html du dossier
- [ ] Évalue chaque élément contre tous les rulesets
- [ ] Calcule un score % avec niveau de confiance
- [ ] Injecte les attributs si confiance ≥ seuil
- [ ] Crée des backups avant modification
- [ ] Génère un rapport détaillé

### Non-Fonctionnels
- [ ] Performance : < 5s pour 50 fichiers HTML
- [ ] Aucune modification si `--dry-run`
- [ ] Préserve l'indentation HTML
- [ ] Logs verbeux avec `--verbose`

---

## 9. Estimation

| Composant | Effort |
|-----------|--------|
| Commande principale | 2h |
| Moteur de règles | 3h |
| Extraction métadonnées | 1h |
| Scoring + conflits | 2h |
| Injection HTML | 1h |
| Rapport + logs | 1h |
| Tests | 2h |
| **Total** | **~12h** |

---

## 10. Risques et Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Faux positifs | Moyenne | Moyen | Seuil `high` par défaut, `--dry-run` |
| HTML mal formé | Faible | Faible | Skip élément + warning |
| Performance | Faible | Moyen | Parser incrémental si besoin |
| Conflit avec html-layer | Faible | Faible | Même attribut `data-track`, commandes mutuellement exclusives |

---

## 11. Décisions Prises

| Question | Décision |
|----------|----------|
| Attribut injecté | `data-track` (cohérence avec html-layer) |
| Fichier events | Réutilise `tracking-events.yaml` existant |
| Nouveau fichier | `tracking-rules.yaml` pour les règles de détection |
| Position workflow | Étape 6bis (alternative à html-layer) |
| Champ ruleset | Ajouté à tracking-events.yaml (optionnel) |

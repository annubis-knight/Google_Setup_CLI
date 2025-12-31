# Cahier des Charges : Architecture YAML Double Fichier

## 1. Contexte et Objectif

### Le Problème

Tu gères plusieurs sites web et tu veux centraliser la configuration du tracking GA4 via GTM. Sans système centralisé :
- Maintenance manuelle de la cohérence HTML / JavaScript / GTM
- Duplication des configurations par projet
- Risques d'incohérences et erreurs de tracking

### La Solution

**Deux fichiers YAML** avec des rôles distincts :

| Fichier | Rôle | Qui l'édite |
|---------|------|-------------|
| `tracking-events.yaml` | Source de vérité (events) | L'utilisateur |
| `gtm-config.yaml` | Configuration GTM technique | Le CLI (auto-généré) |

### Flux de Travail

```
tracking-events.yaml (édité par l'utilisateur)
         │
         │  google-setup generate-tracking
         ▼
gtm-config.yaml (généré automatiquement)
         │
         ├──► Variables GTM (4 standard)
         ├──► Triggers GTM (1 par event)
         ├──► Tags GTM (5 max)
         └──► tracking.js (code JavaScript)
```

***

## 2. Principes de Conception

### Principe 1 : Séparation des Responsabilités

- **L'utilisateur** définit QUOI tracker (events + sélecteurs)
- **Le CLI** génère COMMENT (triggers, variables, tags, JavaScript)

### Principe 2 : Single Source of Truth

Le fichier `tracking-events.yaml` est l'unique source. Tout le reste est dérivé.

### Principe 3 : Orienté Génération de Code

Chaque champ du YAML correspond à un élément nécessaire pour générer le `dataLayer.push()` :
- `event_name` → nom de l'event
- `trigger` → type d'addEventListener
- `selector` → cible CSS

### Principe 4 : Pas de Catalogue

L'utilisateur ajoute uniquement les events dont il a besoin. Pas de liste pré-remplie à activer/désactiver.

***

## 3. Fichier 1 : tracking-events.yaml (Utilisateur)

### Objectif

Fichier que l'utilisateur édite pour définir ses events avec leurs sélecteurs CSS.

### Emplacement

```
projet/
└── tracking/
    └── tracking-events.yaml
```

### Structure Complète

```yaml
project:
  name: "mon-site"
  gtm_container_id: "GTM-XXXXXXX"
  ga4_measurement_id: "G-XXXXXXXXXX"

events:
  - event_name: "form_submit"
    description: "Soumission du formulaire de contact"
    category: "conversion"
    trigger: "submit"
    selector: "form[data-track='contact']"

  - event_name: "phone_click"
    description: "Clic sur un lien téléphone"
    category: "conversion"
    trigger: "click"
    selector: "a[href^='tel:']"

  - event_name: "cta_click"
    description: "Clic sur un bouton CTA"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='cta']"

  - event_name: "scroll_50"
    description: "Scroll à 50% de la page"
    category: "engagement"
    trigger: "scroll"
    threshold: 50
```

### Section project

| Champ | Type | Obligatoire | Format |
|-------|------|-------------|--------|
| `name` | String | Oui | Alphanum + tirets |
| `gtm_container_id` | String | Oui | `GTM-XXXXXXX` |
| `ga4_measurement_id` | String | Oui | `G-XXXXXXXXXX` |

### Champs obligatoires de chaque event

| Champ | Type | Description |
|-------|------|-------------|
| `event_name` | String | Nom snake_case unique |
| `category` | Enum | `conversion`, `lead`, `engagement`, `navigation` |
| `trigger` | Enum | `click`, `submit`, `change`, `scroll`, `timer`, `load` |
| `selector` | String | Sélecteur CSS (sauf pour scroll/timer) |

### Champs optionnels

| Champ | Pour trigger | Description |
|-------|--------------|-------------|
| `description` | Tous | Description humaine de l'event (ex: "Clic sur le bouton de contact") |
| `threshold` | `scroll` | Pourcentage de scroll (ex: 50) |
| `delay` | `timer` | Délai en secondes (ex: 30) |

### Types de Triggers

| Trigger | addEventListener | Usage |
|---------|------------------|-------|
| `click` | `click` | Boutons, liens, éléments cliquables |
| `submit` | `submit` | Formulaires |
| `change` | `change` | Select, checkbox, inputs |
| `scroll` | Intersection Observer | Scroll à X% |
| `timer` | `setTimeout` | Temps passé sur la page |
| `load` | `DOMContentLoaded` | Chargement de page |

### Catégories et Balises GTM Associées

| category | Balise GTM |
|----------|------------|
| `conversion` | GA4 Event - Conversions |
| `lead` | GA4 Event - Leads |
| `engagement` | GA4 Event - Engagement |
| `navigation` | GA4 Event - Navigation |

### Règles de Nommage

**event_name** : snake_case en minuscules

```yaml
✅ form_submit
✅ phone_click
✅ download_pdf

❌ FormSubmit
❌ form-submit
❌ FORM_SUBMIT
```

***

## 4. Fichier 2 : gtm-config.yaml (Généré)

### Objectif

Fichier généré automatiquement contenant la configuration GTM complète.

### Emplacement

```
projet/
└── tracking/
    ├── tracking-events.yaml   ← Source
    └── gtm-config.yaml        ← Généré
```

### Structure

```yaml
# AUTO-GÉNÉRÉ - NE PAS MODIFIER
# Source: tracking-events.yaml

project:
  name: "mon-site"
  gtm_container_id: "GTM-XXXXXXX"
  ga4_measurement_id: "G-XXXXXXXXXX"

variables:
  - name: "Constant - GA4 Measurement ID"
    type: "constant"
    value: "G-XXXXXXXXXX"

  - name: "dlv - element_id"
    type: "data_layer"
    data_layer_name: "element_id"

  - name: "dlv - page_section"
    type: "data_layer"
    data_layer_name: "page_section"

  - name: "dlv - page_path"
    type: "data_layer"
    data_layer_name: "page_path"

triggers:
  - name: "CE - form_submit"
    type: "custom_event"
    event_name: "form_submit"

  - name: "CE - phone_click"
    type: "custom_event"
    event_name: "phone_click"

tags:
  - name: "GA4 Event - Conversions"
    type: "ga4_event"
    configuration_tag: "GA4 - Config"
    event_parameters:
      - name: "element_id"
        value: "{{dlv - element_id}}"
      - name: "page_section"
        value: "{{dlv - page_section}}"
      - name: "page_path"
        value: "{{dlv - page_path}}"
    triggers:
      - "CE - form_submit"
      - "CE - phone_click"
```

### Variables (toujours 4)

| Nom | Type | Description |
|-----|------|-------------|
| `Constant - GA4 Measurement ID` | constant | ID GA4 |
| `dlv - element_id` | data_layer | ID de l'élément |
| `dlv - page_section` | data_layer | Section parente |
| `dlv - page_path` | data_layer | Chemin de page |

### Triggers

| Type | Nommage | Quantité |
|------|---------|----------|
| Custom Event | `CE - {event_name}` | 1 par event |

### Tags (max 5)

| Nom | Type | Triggers |
|-----|------|----------|
| `GA4 Event - Conversions` | ga4_event | Events category=conversion |
| `GA4 Event - Leads` | ga4_event | Events category=lead |
| `GA4 Event - Engagement` | ga4_event | Events category=engagement |
| `GA4 Event - Navigation` | ga4_event | Events category=navigation |

***

## 5. Règles de Génération

### Du YAML vers JavaScript

Pour chaque event dans `tracking-events.yaml` :

```yaml
- event_name: "form_submit"
  category: "conversion"
  trigger: "submit"
  selector: "form[data-track='contact']"
```

Le CLI génère :

```javascript
document.querySelectorAll("form[data-track='contact']").forEach(el => {
  el.addEventListener('submit', function(e) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      'event': 'form_submit',
      'element_id': this.id || 'unknown',
      'page_section': this.closest('section')?.id || 'unknown',
      'page_path': window.location.pathname
    });
  });
});
```

### Cas Spéciaux

**Trigger scroll** :
```yaml
- event_name: "scroll_50"
  trigger: "scroll"
  threshold: 50
```

Génère un Intersection Observer qui déclenche à 50% de scroll.

**Trigger timer** :
```yaml
- event_name: "read_time_30s"
  trigger: "timer"
  delay: 30
```

Génère un `setTimeout` de 30 secondes.

### Du YAML vers GTM

| Source (tracking-events.yaml) | Destination (gtm-config.yaml) |
|------------------------------|-------------------------------|
| `event_name` | Trigger `CE - {event_name}` |
| `category` | Affectation à la balise correspondante |

***

## 6. Correspondance YAML ↔ HTML ↔ JavaScript

### tracking-events.yaml

```yaml
- event_name: "form_submit"
  category: "conversion"
  trigger: "submit"
  selector: "form[data-track='contact']"
```

### HTML

```html
<section id="contact">
  <form id="contact-form" data-track="contact">
    <input type="text" name="name" />
    <button type="submit">Envoyer</button>
  </form>
</section>
```

### JavaScript généré (tracking.js)

```javascript
document.querySelectorAll("form[data-track='contact']").forEach(el => {
  el.addEventListener('submit', function(e) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      'event': 'form_submit',
      'element_id': 'contact-form',
      'page_section': 'contact',
      'page_path': '/contact'
    });
  });
});
```

### gtm-config.yaml (généré)

```yaml
triggers:
  - name: "CE - form_submit"
    type: "custom_event"
    event_name: "form_submit"

tags:
  - name: "GA4 Event - Conversions"
    triggers:
      - "CE - form_submit"
```

***

## 7. Workflow Utilisateur

### Étape 1 : Initialiser

```bash
google-setup init-tracking
# Crée /tracking/tracking-events.yaml
```

### Étape 2 : Configurer les events

```yaml
project:
  name: "mon-site"
  gtm_container_id: "GTM-ABC1234"
  ga4_measurement_id: "G-XYZ9876543"

events:
  - event_name: "form_submit"
    category: "conversion"
    trigger: "submit"
    selector: "form[data-track='contact']"

  - event_name: "phone_click"
    category: "conversion"
    trigger: "click"
    selector: "a[href^='tel:']"
```

### Étape 3 : Générer

```bash
google-setup generate-tracking
# Génère:
# - /tracking/gtm-config.yaml
# - /tracking/tracking.js
```

### Étape 4 : Intégrer le HTML

```html
<!-- Ajouter les attributs data-track -->
<form data-track="contact">...</form>

<!-- Inclure le script -->
<script src="/tracking/tracking.js"></script>
```

### Étape 5 : Synchroniser GTM

```bash
google-setup sync
# Crée dans GTM: variables, triggers, tags
```

***

## 8. Règles de Cohérence

### Unicité des event_name

```yaml
❌ INVALIDE
events:
  - event_name: "form_submit"
  - event_name: "form_submit"  # Doublon
```

### Correspondance selector ↔ HTML

Le sélecteur CSS doit matcher des éléments existants dans le HTML.

```yaml
# YAML
selector: "form[data-track='contact']"
```

```html
<!-- HTML doit contenir -->
<form data-track="contact">
```

### Cohérence event_name partout

| Emplacement | Valeur |
|-------------|--------|
| tracking-events.yaml | `event_name: "form_submit"` |
| tracking.js | `'event': 'form_submit'` |
| gtm-config.yaml | `event_name: "form_submit"` |
| GTM Trigger | Custom Event = `form_submit` |

***

## 9. Validation

### tracking-events.yaml

- [ ] Section project complète
- [ ] Pas de doublon event_name
- [ ] Format snake_case respecté
- [ ] Chaque event a : event_name, category, trigger, selector
- [ ] Trigger valide : click, submit, change, scroll, timer, load
- [ ] Category valide : conversion, lead, engagement, navigation

### gtm-config.yaml

- [ ] Généré sans erreur
- [ ] 4 variables présentes
- [ ] 1 trigger par event
- [ ] Triggers affectés aux bonnes balises

### HTML

- [ ] Sélecteurs CSS correspondent aux éléments HTML
- [ ] Éléments dans des `<section id="xxx">`
- [ ] Éléments ont un `id`

***

## 10. Exemples Complets

### Site Vitrine Simple

```yaml
project:
  name: "mon-site-vitrine"
  gtm_container_id: "GTM-ABC1234"
  ga4_measurement_id: "G-XYZ9876543"

events:
  - event_name: "form_submit"
    description: "Soumission du formulaire de contact"
    category: "conversion"
    trigger: "submit"
    selector: "form[data-track='contact']"

  - event_name: "phone_click"
    description: "Clic sur un numéro de téléphone"
    category: "conversion"
    trigger: "click"
    selector: "a[href^='tel:']"

  - event_name: "email_click"
    description: "Clic sur une adresse email"
    category: "conversion"
    trigger: "click"
    selector: "a[href^='mailto:']"

  - event_name: "cta_click"
    description: "Clic sur un bouton d'action principal"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='cta']"
```

### Site avec Contenu Riche

```yaml
project:
  name: "blog-entreprise"
  gtm_container_id: "GTM-DEF5678"
  ga4_measurement_id: "G-ABC1234567"

events:
  - event_name: "newsletter_signup"
    description: "Inscription à la newsletter"
    category: "lead"
    trigger: "submit"
    selector: "form[data-track='newsletter']"

  - event_name: "download_pdf"
    description: "Téléchargement d'un document PDF"
    category: "lead"
    trigger: "click"
    selector: "a[href$='.pdf']"

  - event_name: "video_play"
    description: "Lecture d'une vidéo"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='video']"

  - event_name: "scroll_50"
    description: "Scroll à 50% de la page"
    category: "engagement"
    trigger: "scroll"
    threshold: 50

  - event_name: "read_time_60s"
    description: "Temps de lecture de 60 secondes"
    category: "engagement"
    trigger: "timer"
    delay: 60

  - event_name: "share_social"
    description: "Partage sur les réseaux sociaux"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='share']"
```

***

## 11. Résumé

| Aspect | tracking-events.yaml | gtm-config.yaml |
|--------|---------------------|-----------------|
| Qui édite | Utilisateur | CLI (auto-généré) |
| Contenu | Events + sélecteurs | Config GTM complète |
| Rôle | Source de vérité | Dérivé |

### Champs par Event

| Champ | Obligatoire | Usage |
|-------|-------------|-------|
| `event_name` | Oui | Nom du dataLayer event |
| `category` | Oui | Affectation balise GTM |
| `trigger` | Oui | Type addEventListener |
| `selector` | Oui* | Cible CSS |
| `description` | Non | Description humaine de l'event |
| `threshold` | Non | Pour scroll uniquement |
| `delay` | Non | Pour timer uniquement |

### Avantages

- **Simplicité** : 4 champs par event, pas de catalogue
- **Orienté code** : Chaque champ génère du JavaScript
- **Cohérence** : 1 event → 1 trigger → 1 entrée tag
- **Flexibilité** : L'utilisateur ajoute ce dont il a besoin

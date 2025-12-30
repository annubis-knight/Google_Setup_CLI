# Cahier des Charges : DataLayer & GTM - Guide Universel

Guide pour l'implémentation du tracking GA4 via GTM avec l'architecture double fichier YAML.

***

## 1. Architecture : Double Fichier YAML

### Principe Fondamental

Le tracking est configuré via **deux fichiers YAML** :

| Fichier | Rôle | Qui l'édite |
|---------|------|-------------|
| `tracking-events.yaml` | Source de vérité | L'utilisateur |
| `gtm-config.yaml` | Config GTM technique | Le CLI (auto-généré) |

### Flux de Travail

```
tracking-events.yaml
         │
         │  google-setup generate-tracking
         ▼
gtm-config.yaml + tracking.js
         │
         ├──► Variables GTM (4)
         ├──► Triggers GTM (1 par event)
         └──► Tags GTM (5 max)
```

***

## 2. Structure d'un Event

### Champs Obligatoires

```yaml
- event_name: "form_submit"      # Nom snake_case unique
  category: "conversion"         # Pour GTM : quelle balise
  trigger: "submit"              # Type addEventListener
  selector: "form[data-track]"   # Sélecteur CSS
```

### Champs Optionnels

| Champ | Pour trigger | Description |
|-------|--------------|-------------|
| `threshold` | `scroll` | Pourcentage (ex: 50) |
| `delay` | `timer` | Secondes (ex: 30) |

### Types de Triggers

| Trigger | addEventListener | Usage |
|---------|------------------|-------|
| `click` | `click` | Boutons, liens |
| `submit` | `submit` | Formulaires |
| `change` | `change` | Select, checkbox |
| `scroll` | Intersection Observer | Scroll à X% |
| `timer` | `setTimeout` | Temps passé |
| `load` | `DOMContentLoaded` | Chargement page |

### Catégories

| category | Balise GTM |
|----------|------------|
| `conversion` | GA4 Event - Conversions |
| `lead` | GA4 Event - Leads |
| `engagement` | GA4 Event - Engagement |
| `navigation` | GA4 Event - Navigation |

***

## 3. Architecture GTM

### Principe : Peu de Balises, Beaucoup de Triggers

**Maximum 5 balises GA4** :
- 1 balise `GA4 - Config` (Trigger Initialisation - All Pages)
- 4 balises `GA4 Event - {Category}`

Chaque balise peut avoir des dizaines de triggers.

### Variables Standard (4)

| Nom GTM | Type | data_layer_name |
|---------|------|-----------------|
| `Constant - GA4 Measurement ID` | constant | - |
| `dlv - element_id` | data_layer | `element_id` |
| `dlv - page_section` | data_layer | `page_section` |
| `dlv - page_path` | data_layer | `page_path` |

### Triggers

| Type | Nommage |
|------|---------|
| Custom Event | `CE - {event_name}` |

***

## 4. DataLayer : Structure

### Format Standard

Chaque `dataLayer.push()` contient 4 éléments :

```javascript
dataLayer.push({
  'event': 'form_submit',        // event_name du YAML
  'element_id': 'contact-form',  // ID HTML de l'élément
  'page_section': 'contact',     // ID de la <section> parente
  'page_path': '/contact'        // window.location.pathname
});
```

### Détection Automatique

Le code JavaScript généré détecte :

| Propriété | Source |
|-----------|--------|
| `element_id` | `this.id` ou généré |
| `page_section` | `this.closest('section')?.id` |
| `page_path` | `window.location.pathname` |

***

## 5. Convention de Nommage

### Events (dataLayer)

**Format** : snake_case minuscules

```javascript
✅ 'form_submit'
✅ 'phone_click'

❌ 'FormSubmit'
❌ 'form-submit'
```

### GTM

| Élément | Format | Exemple |
|---------|--------|---------|
| Tags | `Type - Catégorie` | `GA4 Event - Conversions` |
| Triggers | `CE - event_name` | `CE - form_submit` |
| Variables | `Type - nom` | `dlv - element_id` |

***

## 6. Sélecteurs CSS

### Attribut data-track

Utilise `data-track` pour identifier les éléments :

```html
<form data-track="contact">...</form>
<button data-track="cta">En savoir plus</button>
```

```yaml
selector: "form[data-track='contact']"
selector: "[data-track='cta']"
```

### Sélecteurs Automatiques

Pour certains éléments, pas besoin d'attribut :

```yaml
# Tous les liens téléphone
selector: "a[href^='tel:']"

# Tous les liens email
selector: "a[href^='mailto:']"

# Tous les PDF
selector: "a[href$='.pdf']"

# Liens externes
selector: "a[href^='http']:not([href*='mon-site.fr'])"
```

***

## 7. Correspondance YAML ↔ Code

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
    <button type="submit">Envoyer</button>
  </form>
</section>
```

### JavaScript généré

```javascript
document.querySelectorAll("form[data-track='contact']").forEach(el => {
  el.addEventListener('submit', function(e) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      'event': 'form_submit',
      'element_id': 'contact-form',
      'page_section': 'contact',
      'page_path': window.location.pathname
    });
  });
});
```

### gtm-config.yaml

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

## 8. Workflow Complet

### Étape 1 : Initialiser

```bash
google-setup init-tracking
```

### Étape 2 : Configurer

```yaml
project:
  name: "mon-site"
  gtm_container_id: "GTM-XXXXXXX"
  ga4_measurement_id: "G-XXXXXXXXXX"

events:
  - event_name: "form_submit"
    category: "conversion"
    trigger: "submit"
    selector: "form[data-track='contact']"

  - event_name: "phone_click"
    category: "conversion"
    trigger: "click"
    selector: "a[href^='tel:']"

  - event_name: "cta_click"
    category: "engagement"
    trigger: "click"
    selector: "[data-track='cta']"
```

### Étape 3 : Générer

```bash
google-setup generate-tracking
# Crée: gtm-config.yaml + tracking.js
```

### Étape 4 : Intégrer HTML

```html
<form data-track="contact">...</form>
<button data-track="cta">CTA</button>
<script src="/tracking/tracking.js"></script>
```

### Étape 5 : Synchroniser GTM

```bash
google-setup sync
```

### Étape 6 : Tester

1. Mode Preview GTM
2. DebugView GA4
3. Vérifier les paramètres

***

## 9. Exemples par Type

### Formulaire

```yaml
- event_name: "form_submit"
  category: "conversion"
  trigger: "submit"
  selector: "form[data-track='contact']"
```

```html
<form id="contact-form" data-track="contact">
```

### Lien Téléphone

```yaml
- event_name: "phone_click"
  category: "conversion"
  trigger: "click"
  selector: "a[href^='tel:']"
```

```html
<a href="tel:+33123456789">Appeler</a>
```

### Bouton CTA

```yaml
- event_name: "cta_click"
  category: "engagement"
  trigger: "click"
  selector: "[data-track='cta']"
```

```html
<button data-track="cta">En savoir plus</button>
```

### Scroll 50%

```yaml
- event_name: "scroll_50"
  category: "engagement"
  trigger: "scroll"
  threshold: 50
```

### Temps de Lecture

```yaml
- event_name: "read_time_30s"
  category: "engagement"
  trigger: "timer"
  delay: 30
```

### Téléchargement PDF

```yaml
- event_name: "download_pdf"
  category: "lead"
  trigger: "click"
  selector: "a[href$='.pdf']"
```

***

## 10. Règles de Cohérence

### Un Event = Un Push

```javascript
✅ CORRECT
dataLayer.push({
  'event': 'form_submit',
  'element_id': 'contact-form',
  'page_section': 'contact',
  'page_path': '/contact'
});

❌ INCORRECT
dataLayer.push({'event': 'form_submit'});
dataLayer.push({'element_id': 'contact-form'});
```

### Guillemets Obligatoires

```javascript
✅ dataLayer.push({'event': 'form_submit'})
❌ dataLayer.push({event: 'form_submit'})
```

### Pas de Préfixe dans le DataLayer

```javascript
❌ 'dlv-element_id': 'btn-hero'
✅ 'element_id': 'btn-hero'
```

Le préfixe `dlv-` est uniquement pour GTM, jamais dans le code.

***

## 11. Checklist

### tracking-events.yaml

- [ ] Section project complète
- [ ] Pas de doublon event_name
- [ ] Format snake_case
- [ ] Chaque event : event_name, category, trigger, selector
- [ ] Triggers valides : click, submit, change, scroll, timer, load
- [ ] Categories valides : conversion, lead, engagement, navigation

### HTML

- [ ] Attributs `data-track` présents
- [ ] Éléments dans des `<section id="xxx">`
- [ ] Éléments ont un `id`

### GTM

- [ ] Variables DLV créées (4)
- [ ] Triggers CE créés (1 par event)
- [ ] Tags GA4 créés (5 max)
- [ ] Mode Preview OK
- [ ] DebugView GA4 OK

***

## 12. Résumé

### Structure Event

```yaml
- event_name: "xxx"      # Nom snake_case
  category: "xxx"        # conversion | lead | engagement | navigation
  trigger: "xxx"         # click | submit | change | scroll | timer | load
  selector: "xxx"        # Sélecteur CSS
```

### 3 Principes

1. **Source unique** : tracking-events.yaml, tout le reste est généré
2. **4 champs par event** : event_name, category, trigger, selector
3. **Cohérence** : snake_case partout, préfixes GTM uniquement

### Avantages

| Aspect | Bénéfice |
|--------|----------|
| Simplicité | 4 champs par event |
| Orienté code | Chaque champ génère du JavaScript |
| Flexibilité | L'utilisateur ajoute ce dont il a besoin |
| Cohérence | 1 event → 1 trigger → 1 entrée tag |

# Plan de Taggage

> Document généré par google-setup-cli
> Source de vérité : `gtm-tracking-plan.yml`

---

## Informations Projet

| Élément | Valeur |
|---------|--------|
| **Projet** | {{PROJECT_NAME}} |
| **Domaine** | {{DOMAIN}} |
| **GA4 Measurement ID** | {{GA4_MEASUREMENT_ID}} |
| **GTM Container ID** | {{GTM_CONTAINER_ID}} |
| **Dernière mise à jour** | {{DATE}} |

---

## Vue d'ensemble des événements

| ID | Nom | Catégorie | Conversion | Activé |
|----|-----|-----------|------------|--------|
| `cta_click` | CTA - Clic | Lead Generation | Oui | Oui |
| `form_submit` | Formulaire - Soumission | Lead Generation | Oui | Oui |
| `phone_click` | Contact - Téléphone | Contact | Oui | Oui |
| `email_click` | Contact - Email | Contact | Non | Oui |
| `whatsapp_click` | Contact - WhatsApp | Contact | Non | Non |
| `funnel_step` | Funnel - Étape | Funnel | Non | Non |
| `scroll_depth` | Scroll - Profondeur | Engagement | Non | Oui |
| `view_item` | Produit - Vue | Ecommerce | Non | Non |
| `add_to_cart` | Panier - Ajout | Ecommerce | Oui | Non |
| `begin_checkout` | Checkout - Début | Ecommerce | Oui | Non |
| `purchase` | Achat - Confirmation | Ecommerce | Oui | Non |

---

## Détail des événements

### CTA - Clic

| Élément | Valeur |
|---------|--------|
| **ID** | `cta_click` |
| **Catégorie** | Lead Generation |
| **Objectif** | Mesurer les clics sur les CTAs principaux |
| **Action utilisateur** | Clic sur bouton CTA |
| **Sélecteur HTML** | `[data-track-cta], .cta-button, .btn-primary` |
| **Event dataLayer** | `clic_cta` |
| **Fonction JS** | `trackCTA(location)` |
| **Trigger GTM** | Événement personnalisé : `clic_cta` |
| **Balise GTM** | GA4 - EV - CTA Click |
| **Event GA4** | `clic_cta` |
| **Conversion** | Oui |

**Paramètres :**

| Paramètre | Type | Requis | Valeurs possibles |
|-----------|------|--------|-------------------|
| `cta_location` | string | Oui | hero, banner, footer, navbar, sidebar, popup |

**Variables GTM :**
- `{{DLV - cta_location}}` → `cta_location`

---

### Formulaire - Soumission

| Élément | Valeur |
|---------|--------|
| **ID** | `form_submit` |
| **Catégorie** | Lead Generation |
| **Objectif** | Lead généré via formulaire |
| **Action utilisateur** | Soumission de formulaire |
| **Event dataLayer** | `form_submit` |
| **Fonction JS** | `trackFormSubmit(formName, value)` |
| **Trigger GTM** | Événement personnalisé : `form_submit` |
| **Balise GTM** | GA4 - EV - Form Submit |
| **Event GA4** | `generate_lead` |
| **Conversion** | Oui |

**Paramètres :**

| Paramètre | Type | Requis | Valeurs possibles |
|-----------|------|--------|-------------------|
| `form_name` | string | Oui | contact, devis, newsletter, callback, demo |
| `lead_value` | number | Non | (valeur estimée du lead) |

**Variables GTM :**
- `{{DLV - form_name}}` → `form_name`
- `{{DLV - lead_value}}` → `value`

---

### Contact - Téléphone

| Élément | Valeur |
|---------|--------|
| **ID** | `phone_click` |
| **Catégorie** | Contact |
| **Objectif** | Intention de contact par téléphone |
| **Action utilisateur** | Clic sur numéro de téléphone |
| **Sélecteur HTML** | `a[href^='tel:']` |
| **Auto-track** | Oui (tracking automatique) |
| **Event dataLayer** | `phone_click` |
| **Fonction JS** | `trackPhoneClick()` |
| **Event GA4** | `phone_click` |
| **Conversion** | Oui |

---

### Contact - Email

| Élément | Valeur |
|---------|--------|
| **ID** | `email_click` |
| **Catégorie** | Contact |
| **Objectif** | Intention de contact par email |
| **Sélecteur HTML** | `a[href^='mailto:']` |
| **Auto-track** | Oui |
| **Event dataLayer** | `email_click` |
| **Event GA4** | `email_click` |
| **Conversion** | Non |

---

### Scroll - Profondeur

| Élément | Valeur |
|---------|--------|
| **ID** | `scroll_depth` |
| **Catégorie** | Engagement |
| **Objectif** | Mesurer l'engagement sur la page |
| **Action utilisateur** | Scroll à 25%, 50%, 75%, 100% |
| **Event dataLayer** | `scroll_depth` |
| **Fonction JS** | `trackScrollDepth()` |
| **Event GA4** | `scroll` |
| **Conversion** | Non |

**Paramètres :**

| Paramètre | Type | Valeurs |
|-----------|------|---------|
| `scroll_percent` | number | 25, 50, 75, 100 |

---

## Événements E-commerce (si activés)

### Vue Produit (`view_item`)

```javascript
trackViewItem({
  item_id: 'SKU123',
  item_name: 'Produit XYZ',
  price: 99.99,
  currency: 'EUR'
});
```

### Ajout Panier (`add_to_cart`)

```javascript
trackAddToCart({
  item_id: 'SKU123',
  item_name: 'Produit XYZ',
  price: 99.99,
  quantity: 1
});
```

### Début Checkout (`begin_checkout`)

```javascript
trackBeginCheckout(items, totalValue, 'EUR');
```

### Achat (`purchase`)

```javascript
trackPurchase('ORDER-123', items, totalValue, 'EUR');
```

---

## Variables GTM à créer

### Variables DataLayer (Lead Gen)

| Nom GTM | Variable dataLayer |
|---------|-------------------|
| DLV - cta_location | cta_location |
| DLV - form_name | form_name |
| DLV - lead_value | lead_value |

### Variables DataLayer (Engagement)

| Nom GTM | Variable dataLayer |
|---------|-------------------|
| DLV - scroll_percent | scroll_percent |

### Variables DataLayer (Funnel)

| Nom GTM | Variable dataLayer |
|---------|-------------------|
| DLV - funnel_name | funnel_name |
| DLV - step_number | step_number |
| DLV - step_name | step_name |

### Variables DataLayer (Ecommerce)

| Nom GTM | Variable dataLayer |
|---------|-------------------|
| DLV - ecommerce.items | ecommerce.items |
| DLV - ecommerce.value | ecommerce.value |
| DLV - ecommerce.currency | ecommerce.currency |
| DLV - ecommerce.transaction_id | ecommerce.transaction_id |

---

## Triggers GTM à créer

| Nom | Type | Condition |
|-----|------|-----------|
| EV - clic_cta | Événement personnalisé | event equals clic_cta |
| EV - form_submit | Événement personnalisé | event equals form_submit |
| EV - phone_click | Événement personnalisé | event equals phone_click |
| EV - email_click | Événement personnalisé | event equals email_click |
| EV - scroll_depth | Événement personnalisé | event equals scroll_depth |

---

## Balises GTM à créer

| Nom | Type | Trigger |
|-----|------|---------|
| GA4 - Config | Google Tag | All Pages |
| GA4 - EV - CTA Click | Événement GA4 | EV - clic_cta |
| GA4 - EV - Form Submit | Événement GA4 | EV - form_submit |
| GA4 - EV - Phone Click | Événement GA4 | EV - phone_click |
| GA4 - EV - Email Click | Événement GA4 | EV - email_click |
| GA4 - EV - Scroll Depth | Événement GA4 | EV - scroll_depth |

---

## Checklist de déploiement

- [ ] Fichier `gtm-tracking.js` créé avec toutes les fonctions
- [ ] Fichier `gtm-head.html` intégré dans `<head>`
- [ ] Fichier `gtm-body.html` intégré après `<body>`
- [ ] Variables GTM créées
- [ ] Triggers GTM créés
- [ ] Balises GA4 créées
- [ ] Tests en mode Preview
- [ ] Conversions configurées dans GA4
- [ ] Container GTM publié

---

*Document généré par [google-setup-cli](https://github.com/annubis-knight/Google_Setup_CLI)*

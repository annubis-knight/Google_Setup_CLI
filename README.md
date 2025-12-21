# Google Setup CLI v2.0

**Automatisez la configuration de vos outils Google Analytics en quelques minutes.**

Un outil en ligne de commande qui configure automatiquement GTM, GA4, Search Console et Hotjar pour vos sites web.

---

## Table des matières

- [Pourquoi cet outil ?](#pourquoi-cet-outil-)
- [Installation rapide](#installation-rapide)
- [Configuration initiale (5 min)](#configuration-initiale-5-min)
- [Utilisation](#utilisation)
- [Commandes disponibles](#commandes-disponibles)
- [Templates de tracking](#templates-de-tracking)
- [Intégration dans votre site](#intégration-dans-votre-site)
- [FAQ](#faq)
- [Développement](#développement)

---

## Pourquoi cet outil ?

Configurer correctement Google Tag Manager, GA4 et les conversions prend du temps et est source d'erreurs. Cet outil :

- **Audite** votre configuration existante et donne un score
- **Déploie** automatiquement GTM + GA4 + events
- **Synchronise** vos dataLayer locaux avec GTM
- **Génère** les fichiers de tracking prêts à l'emploi

---

## Installation rapide

### Option 1 : Installation globale (recommandé)

```bash
npm install -g google-setup
```

### Option 2 : Installation locale (développement)

```bash
git clone https://github.com/annubis-knight/Google_Setup_CLI.git
cd Google_Setup_CLI
npm install
npm link
```

Vérifiez l'installation :

```bash
google-setup --version
# Devrait afficher : 2.0.0
```

---

## Configuration initiale (5 min)

Avant d'utiliser l'outil, vous devez configurer l'accès aux APIs Google.

### Étape 1 : Créer un projet Google Cloud

1. Allez sur [Google Cloud Console](https://console.cloud.google.com)
2. Cliquez sur **"Créer un projet"**
3. Donnez un nom (ex: "Mon Setup Analytics")
4. Cliquez sur **"Créer"**

### Étape 2 : Activer les APIs nécessaires

Dans votre projet Google Cloud, activez ces 4 APIs :

1. Allez dans **"APIs et services" > "Bibliothèque"**
2. Recherchez et activez :
   - `Tag Manager API`
   - `Google Analytics Admin API`
   - `Search Console API`
   - `Site Verification API`

> **Astuce** : Cliquez sur chaque API puis sur le bouton bleu "Activer"

### Étape 3 : Créer un Service Account

1. Allez dans **"APIs et services" > "Identifiants"**
2. Cliquez sur **"Créer des identifiants" > "Compte de service"**
3. Donnez un nom (ex: "google-setup-bot")
4. Cliquez sur **"Créer et continuer"** (ignorez les rôles optionnels)
5. Cliquez sur le compte créé
6. Onglet **"Clés" > "Ajouter une clé" > "Créer une clé"**
7. Choisissez **JSON** et téléchargez le fichier

> **Important** : Gardez ce fichier JSON en sécurité, il contient vos credentials.

### Étape 4 : Donner les permissions au Service Account

Copiez l'email du Service Account (ressemble à : `mon-bot@mon-projet.iam.gserviceaccount.com`)

**Dans Google Tag Manager :**
1. Ouvrez [tagmanager.google.com](https://tagmanager.google.com)
2. Allez dans **Admin > Gestion des utilisateurs**
3. Cliquez sur **"+"** et ajoutez l'email du Service Account
4. Donnez les droits **"Publier"**

**Dans Google Analytics :**
1. Ouvrez [analytics.google.com](https://analytics.google.com)
2. Allez dans **Admin > Gestion des accès au compte**
3. Cliquez sur **"+"** et ajoutez l'email du Service Account
4. Donnez les droits **"Éditeur"**

### Étape 5 : Initialiser l'outil

```bash
google-setup init
```

L'assistant vous demandera :
- Le chemin vers votre fichier JSON (credentials)
- Votre GTM Account ID
- Votre GA4 Account ID

> **Où trouver les Account IDs ?**
> - **GTM** : Dans l'URL de GTM → `accounts/XXXXXX/containers/...` → XXXXXX est votre ID
> - **GA4** : Admin > Détails du compte → L'ID est affiché

---

## Utilisation

### Mode interactif (le plus simple)

```bash
google-setup
```

Un menu interactif s'affiche avec toutes les options disponibles.

### Mode commande

```bash
google-setup <commande> [options]
```

---

## Commandes disponibles

### `status` - Voir la progression

Affiche une checklist de ce qui est configuré et ce qui manque.

```bash
google-setup status -d "mon-site.fr"
```

**Exemple de sortie :**
```
═══════════════════════════════════════════════════════════════════════
  CHECKLIST - mon-site.fr
═══════════════════════════════════════════════════════════════════════

✅ 1. Google Analytics 4 (100%)
   ✓ Propriété GA4 existe
   ✓ Data Stream configuré

✅ 2. Google Tag Manager (100%)
   ✓ Conteneur GTM existe
   ✓ Balise GA4 Config

⏳ 3. DataLayer Custom (33%)
   ✗ Variables DataLayer (min 5)
   ✗ Triggers custom events (min 3)

───────────────────────────────────────────────────────────────────────
🎯 Progression globale : ████████████░░░░░░░░ 60%
───────────────────────────────────────────────────────────────────────
```

---

### `continue` - Reprendre le déploiement

Détecte automatiquement ce qui manque et le déploie.

```bash
# Mode interactif (confirmation à chaque étape)
google-setup continue -d "mon-site.fr"

# Mode automatique (tout d'un coup)
google-setup continue -d "mon-site.fr" --auto
```

> **Intelligent** : Ne recrée jamais ce qui existe déjà.

---

### `sync` - Synchroniser local → GTM

Lit vos fichiers de tracking locaux et crée les triggers/variables correspondants dans GTM.

```bash
google-setup sync -d "mon-site.fr"
```

**Ce que fait sync :**

1. Scanne votre projet pour trouver les fichiers tracking (`tracking.js`, `gtm-tracking.js`, etc.)
2. Extrait les events `dataLayer.push({ event: 'xxx' })`
3. Compare avec ce qui existe dans GTM
4. Crée automatiquement :
   - Les **triggers** (ex: `Event - clic_cta`)
   - Les **variables** DataLayer (ex: `DLV - cta_location`)
   - Les **balises GA4** Event correspondantes

**Fichiers détectés automatiquement :**
- `**/gtm-head.html`
- `**/gtm-body.html`
- `**/tracking.js` / `**/gtm-tracking.js` / `**/datalayer.js`

---

### `audit` - Auditer la configuration

Génère un rapport complet avec score.

```bash
# Un seul site
google-setup audit -d "mon-site.fr"

# Plusieurs sites
google-setup audit -d "site1.fr,site2.fr,site3.fr"
```

**Score calculé :**

| Outil | Poids |
|-------|-------|
| GA4 | 30% |
| DataLayer | 30% |
| GTM | 20% |
| Search Console | 15% |
| Hotjar | 5% |

**Grades :**

| Score | Grade |
|-------|-------|
| 90-100 | A+ |
| 80-89 | A |
| 70-79 | B |
| 60-69 | C |
| 40-59 | D |
| 0-39 | F |

---

### `deploy` - Déploiement complet

Crée tout de zéro : GTM, GA4, balises, triggers, variables.

```bash
# Interactif
google-setup deploy -d "mon-site.fr"

# Avec options
google-setup deploy -d "mon-site.fr" -n "Mon Site" -t lead-gen

# Automatique
google-setup deploy -d "mon-site.fr" --auto
```

---

## Templates de tracking

Choisissez le template adapté à votre site :

### `minimal` - Sites vitrines simples

- GA4 pageviews uniquement
- Aucun event custom

### `lead-gen` - Sites de génération de leads (par défaut)

Events inclus :
- `clic_cta` - Clics sur les boutons d'action
- `form_submit` - Soumissions de formulaires
- `phone_click` - Clics sur liens téléphone
- `email_click` - Clics sur liens email

### `ecommerce` - Sites e-commerce

Events inclus :
- `view_item` - Vue d'un produit
- `add_to_cart` - Ajout au panier
- `begin_checkout` - Début de paiement
- `purchase` - Achat finalisé

---

## Intégration dans votre site

Après un déploiement, vous obtenez ces fichiers :

```
mon-projet/
├── components/
│   ├── gtm-head.html    # Script GTM pour <head>
│   └── gtm-body.html    # Noscript GTM pour <body>
├── src/
│   └── tracking.js      # Fonctions de tracking
└── .google-setup.json   # Config locale
```

### Intégration HTML

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Copiez le contenu de gtm-head.html ici -->
  <script>(function(w,d,s,l,i){...})(window,document,'script','dataLayer','GTM-XXXXX');</script>
</head>
<body>
  <!-- Copiez le contenu de gtm-body.html ici (juste après <body>) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXX"...></iframe></noscript>

  <!-- Votre contenu -->
  <button onclick="trackCTA('hero')">Demander un devis</button>

  <!-- Incluez tracking.js avant </body> -->
  <script src="src/tracking.js"></script>
</body>
</html>
```

### Utilisation des fonctions (template lead-gen)

```javascript
// Tracker un clic sur un CTA
trackCTA('hero');        // hero, sidebar, footer, header...

// Tracker une soumission de formulaire
trackFormSubmit('contact');
trackFormSubmit('devis', 100);  // Avec valeur estimée du lead

// Les clics sur tel: et mailto: sont trackés automatiquement
```

### Utilisation des fonctions (template ecommerce)

```javascript
// Vue d'un produit
trackViewItem({
  item_id: 'SKU123',
  item_name: 'T-shirt bleu',
  price: 29.99,
  currency: 'EUR'
});

// Ajout au panier
trackAddToCart({
  item_id: 'SKU123',
  item_name: 'T-shirt bleu',
  price: 29.99,
  quantity: 2
});

// Début du checkout
trackBeginCheckout(cartItems, 59.98, 'EUR');

// Achat finalisé
trackPurchase('ORDER-456', cartItems, 59.98, 'EUR');
```

---

## FAQ

### Le status affiche "Bloqué par X", c'est grave ?

Non, c'est normal. Les étapes ont des dépendances :
- DataLayer dépend de GTM
- GTM dépend de GA4

Si GA4 n'est pas configuré, GTM sera "bloqué". Configurez GA4 d'abord.

### Mes fichiers tracking existants vont être écrasés ?

Non. L'outil détecte les fichiers existants et les préserve :
```
⏭️ gtm-head.html existe déjà: ./components/gtm-head.html
⏭️ Fichier tracking existe déjà: ./js/utils/gtm-tracking.js
```

### Comment mettre à jour les triggers après modification du code ?

```bash
google-setup sync -d "mon-site.fr"
```

La commande `sync` compare votre code local avec GTM et crée uniquement ce qui manque.

### Où sont stockées mes credentials ?

- Credentials Google : `~/.google-credentials.json`
- Configuration : `~/.google-setup-config.json`

---

## Développement

```bash
# Cloner le repo
git clone https://github.com/annubis-knight/Google_Setup_CLI.git
cd Google_Setup_CLI

# Installer les dépendances
npm install

# Lancer en développement
node bin/cli.js

# Lancer les tests
npm test
```

### Structure du projet

```
src/
├── commands/          # Commandes CLI (audit, deploy, status, sync...)
├── detectors/         # Détection GTM, GA4, Search Console, Hotjar
├── deployers/         # Création GTM, GA4, triggers, variables
└── utils/             # Auth, checklist, fichiers générés
```

---

## Licence

MIT - Utilisez librement dans vos projets.

---

**Créé par [Arnaud Gutierrez](mailto:arnaud.g.motiv@gmail.com)**

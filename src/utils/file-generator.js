import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { detectLocalProject } from '../detectors/local-project-detector.js';

/**
 * Génère les fichiers GTM (head et body) seulement s'ils n'existent pas
 * @param {string} containerId - ID du conteneur GTM
 * @param {boolean} force - Forcer l'écrasement si true (défaut: false)
 * @returns {Object} { created: [], skipped: [] }
 */
export function generateGTMFiles(containerId, force = false) {
  const result = { created: [], skipped: [] };

  // Détecter les fichiers existants
  const localProject = detectLocalProject(process.cwd());

  // gtm-head.html
  if (!force && localProject.gtmHead) {
    console.log(`   ⏭️ gtm-head.html existe déjà: ${localProject.gtmHead}`);
    result.skipped.push('gtm-head.html');
  } else {
    if (!existsSync('./components')) {
      mkdirSync('./components', { recursive: true });
    }

    const gtmHead = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${containerId}');</script>
<!-- End Google Tag Manager -->`;

    writeFileSync('./components/gtm-head.html', gtmHead);
    console.log('   ✓ components/gtm-head.html créé');
    result.created.push('gtm-head.html');
  }

  // gtm-body.html
  if (!force && localProject.gtmBody) {
    console.log(`   ⏭️ gtm-body.html existe déjà: ${localProject.gtmBody}`);
    result.skipped.push('gtm-body.html');
  } else {
    if (!existsSync('./components')) {
      mkdirSync('./components', { recursive: true });
    }

    const gtmBody = `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${containerId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;

    writeFileSync('./components/gtm-body.html', gtmBody);
    console.log('   ✓ components/gtm-body.html créé');
    result.created.push('gtm-body.html');
  }

  return result;
}

/**
 * Génère le fichier tracking.js avec les fonctions dataLayer
 * @param {string} template - Template à utiliser (lead-gen, ecommerce, minimal)
 * @param {boolean} force - Forcer l'écrasement si true (défaut: false)
 * @returns {Object} { created: boolean, skipped: boolean, existingFile: string|null }
 */
export function generateTrackingJS(template = 'lead-gen', force = false) {
  const result = { created: false, skipped: false, existingFile: null };

  // Détecter les fichiers tracking existants
  const localProject = detectLocalProject(process.cwd());

  // Vérifier si des fichiers tracking existent déjà
  const trackingFiles = localProject.trackingFiles || [];
  if (!force && trackingFiles.length > 0) {
    const existingFile = trackingFiles[0];
    console.log(`   ⏭️ Fichier tracking existe déjà: ${existingFile}`);
    result.skipped = true;
    result.existingFile = existingFile;
    return result;
  }

  if (!existsSync('./src')) {
    mkdirSync('./src', { recursive: true });
  }

  let trackingJS = `/**
 * Tracking DataLayer - Généré par google-setup-cli
 * Template: ${template}
 * Date: ${new Date().toISOString()}
 */

window.dataLayer = window.dataLayer || [];

`;

  if (template === 'lead-gen' || template === 'minimal') {
    trackingJS += `/**
 * Track CTA click
 * @param {string} location - Position du CTA (hero, sidebar, footer, header...)
 */
function trackCTA(location) {
  dataLayer.push({
    event: 'clic_cta',
    cta_location: location
  });
}

/**
 * Track form submission
 * @param {string} formName - Nom du formulaire (contact, devis, newsletter...)
 * @param {number} value - Valeur estimée du lead (optionnel, défaut 0)
 */
function trackFormSubmit(formName, value = 0) {
  dataLayer.push({
    event: 'form_submit',
    form_name: formName,
    lead_value: value
  });
}

/**
 * Track phone link click
 */
function trackPhoneClick() {
  dataLayer.push({
    event: 'phone_click'
  });
}

/**
 * Track email link click
 */
function trackEmailClick() {
  dataLayer.push({
    event: 'email_click'
  });
}

// Auto-track des liens téléphone et email
document.addEventListener('DOMContentLoaded', function() {
  // Liens téléphone
  document.querySelectorAll('a[href^="tel:"]').forEach(function(el) {
    el.addEventListener('click', function() {
      trackPhoneClick();
    });
  });

  // Liens email
  document.querySelectorAll('a[href^="mailto:"]').forEach(function(el) {
    el.addEventListener('click', function() {
      trackEmailClick();
    });
  });
});
`;
  }

  if (template === 'ecommerce') {
    trackingJS += `/**
 * Track product view
 * @param {Object} item - Produit {item_id, item_name, price, currency}
 */
function trackViewItem(item) {
  dataLayer.push({
    event: 'view_item',
    ecommerce: {
      items: [item],
      value: item.price,
      currency: item.currency || 'EUR'
    }
  });
}

/**
 * Track add to cart
 * @param {Object} item - Produit {item_id, item_name, price, quantity, currency}
 */
function trackAddToCart(item) {
  dataLayer.push({
    event: 'add_to_cart',
    ecommerce: {
      items: [item],
      value: item.price * (item.quantity || 1),
      currency: item.currency || 'EUR'
    }
  });
}

/**
 * Track begin checkout
 * @param {Array} items - Liste des produits
 * @param {number} value - Valeur totale
 * @param {string} currency - Devise (défaut EUR)
 */
function trackBeginCheckout(items, value, currency = 'EUR') {
  dataLayer.push({
    event: 'begin_checkout',
    ecommerce: {
      items: items,
      value: value,
      currency: currency
    }
  });
}

/**
 * Track purchase
 * @param {string} transactionId - ID de la transaction
 * @param {Array} items - Liste des produits
 * @param {number} value - Valeur totale
 * @param {string} currency - Devise (défaut EUR)
 */
function trackPurchase(transactionId, items, value, currency = 'EUR') {
  dataLayer.push({
    event: 'purchase',
    ecommerce: {
      transaction_id: transactionId,
      items: items,
      value: value,
      currency: currency
    }
  });
}
`;
  }

  writeFileSync('./src/tracking.js', trackingJS);
  console.log('   ✓ src/tracking.js créé');
  result.created = true;
  return result;
}

/**
 * Sauvegarde la configuration locale du projet avec merge intelligent
 */
export function saveLocalConfig(config) {
  const configPath = './.google-setup.json';
  let existing = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (e) {
      // Ignore
    }
  }

  // Deep merge
  const merged = {
    ...existing,
    ...config,
    ga4: { ...existing.ga4, ...config.ga4 },
    gtm: { ...existing.gtm, ...config.gtm },
    thirdParty: { ...existing.thirdParty, ...config.thirdParty },
    updatedAt: new Date().toISOString()
  };

  writeFileSync(configPath, JSON.stringify(merged, null, 2));
  console.log('   ✓ .google-setup.json mis à jour');
}

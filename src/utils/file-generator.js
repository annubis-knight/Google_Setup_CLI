import { writeFileSync, mkdirSync, existsSync } from 'fs';
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

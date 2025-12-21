import { google } from 'googleapis';

/**
 * Crée une propriété GA4 et son flux de données web
 */
export async function deployGA4(domain, projectName, accountId) {
  const analyticsAdmin = google.analyticsadmin('v1beta');

  console.log('📊 Création propriété GA4...');

  // 1. Créer la propriété
  const property = await analyticsAdmin.properties.create({
    requestBody: {
      parent: `accounts/${accountId}`,
      displayName: projectName,
      timeZone: 'Europe/Paris',
      currencyCode: 'EUR'
    }
  });

  console.log(`   ✓ Propriété créée: ${property.data.name}`);

  // 2. Créer le flux de données web
  const dataStream = await analyticsAdmin.properties.dataStreams.create({
    parent: property.data.name,
    requestBody: {
      type: 'WEB_DATA_STREAM',
      displayName: `${projectName} - Web`,
      webStreamData: {
        defaultUri: `https://www.${domain.replace('www.', '')}`
      }
    }
  });

  const measurementId = dataStream.data.webStreamData.measurementId;
  console.log(`   ✓ Flux de données créé: ${measurementId}`);

  return {
    propertyId: property.data.name.split('/')[1],
    propertyName: projectName,
    measurementId,
    dataStreamId: dataStream.data.name.split('/').pop()
  };
}

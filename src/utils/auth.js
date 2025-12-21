import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.edit',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/siteverification'
];

export function getCredentialsPath() {
  return join(homedir(), '.google-credentials.json');
}

export function getConfigPath() {
  return join(homedir(), '.google-setup-config.json');
}

export async function getAuthClient() {
  const credPath = getCredentialsPath();

  if (!existsSync(credPath)) {
    throw new Error(`Credentials non trouvées: ${credPath}\nLancez: google-setup init`);
  }

  const credentials = JSON.parse(readFileSync(credPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES
  });

  const client = await auth.getClient();
  google.options({ auth: client });

  return client;
}

export function loadConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

export function saveConfig(config) {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

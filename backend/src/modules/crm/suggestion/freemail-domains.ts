/**
 * Common freemail providers — emails from these domains should NOT
 * trigger automatic CRM account creation.
 */
const FREEMAIL_DOMAINS = new Set([
  // Global
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.it',
  'msn.com',
  'yahoo.com',
  'yahoo.it',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'zoho.com',
  'zohomail.com',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'inbox.ru',
  'tutanota.com',
  'tuta.io',
  'fastmail.com',
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'web.de',
  'mail.com',
  'email.com',
  'usa.com',
  'hushmail.com',
  'runbox.com',
  // Italy-specific
  'libero.it',
  'virgilio.it',
  'alice.it',
  'tin.it',
  'tiscali.it',
  'aruba.it',
  'pec.it',
  // France
  'laposte.net',
  'orange.fr',
  'free.fr',
  'sfr.fr',
  // Germany
  't-online.de',
  'freenet.de',
  // Spain
  'telefonica.net',
]);

export function isFreemailDomain(domain: string): boolean {
  return FREEMAIL_DOMAINS.has(domain.toLowerCase());
}

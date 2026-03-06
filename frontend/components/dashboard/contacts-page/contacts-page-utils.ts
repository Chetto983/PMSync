import { type Contact } from '@/lib/api/contacts';

export const getPrimaryEmail = (contact?: Contact | null) =>
  contact?.emails?.find((email) => email.primary)?.value ||
  contact?.emails?.[0]?.value ||
  '';

export const getPrimaryPhone = (contact?: Contact | null) =>
  contact?.phoneNumbers?.find((phone) => phone.primary)?.value ||
  contact?.phoneNumbers?.[0]?.value ||
  '';

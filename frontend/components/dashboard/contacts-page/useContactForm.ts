import { useState } from 'react';
import { type Contact } from '@/lib/api/contacts';
import { type ProviderConfig } from '@/lib/api/providers';
import { getPrimaryEmail, getPrimaryPhone } from './contacts-page-utils';

export type ContactFormState = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  department: string;
  birthday: string;
  website: string;
  notes: string;
  providerId?: string;
  isVip: boolean;
};

const EMPTY_FORM: ContactFormState = {
  firstName: '',
  lastName: '',
  displayName: '',
  email: '',
  phone: '',
  company: '',
  jobTitle: '',
  department: '',
  birthday: '',
  website: '',
  notes: '',
  providerId: undefined,
  isVip: false,
};

export function useContactForm() {
  const [contactForm, setContactForm] = useState<ContactFormState>(EMPTY_FORM);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactDialogMode, setContactDialogMode] = useState<'create' | 'edit'>('create');

  const handleContactFormChange = (field: keyof ContactFormState, value: string | boolean) => {
    setContactForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForCreate = (providers: ProviderConfig[]) => {
    setContactDialogMode('create');
    setContactForm({
      ...EMPTY_FORM,
      providerId: providers[0]?.id,
    });
    setContactDialogOpen(true);
  };

  const resetForEdit = (contact: Contact, providers: ProviderConfig[]) => {
    setContactDialogMode('edit');
    setContactForm({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      displayName: contact.displayName || '',
      email: getPrimaryEmail(contact),
      phone: getPrimaryPhone(contact),
      company: contact.company || '',
      jobTitle: contact.jobTitle || '',
      department: contact.department || '',
      birthday: contact.birthday ? new Date(contact.birthday).toISOString().split('T')[0] : '',
      website: contact.websites?.[0]?.url || '',
      notes: contact.notes || '',
      providerId: contact.providerContacts?.[0]?.providerId || providers[0]?.id,
      isVip: contact.isVip || false,
    });
    setContactDialogOpen(true);
  };

  const updateProviderIdIfEmpty = (providerId: string) => {
    setContactForm((prev) => ({
      ...prev,
      providerId: prev.providerId || providerId,
    }));
  };

  return {
    contactForm,
    setContactForm,
    contactDialogOpen,
    setContactDialogOpen,
    contactDialogMode,
    handleContactFormChange,
    resetForCreate,
    resetForEdit,
    updateProviderIdIfEmpty,
  };
}

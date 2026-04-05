import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Contact type representing a saved address
 */
export interface Contact {
  id: string;
  name: string;
  /** Resolved 0x address */
  address: string;
  /** Original ENS name if the contact was added via ENS (e.g. "vitalik.eth") */
  ensName?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Contacts store state
 */
interface ContactsState {
  contacts: Contact[];
}

/**
 * Contacts store actions
 */
interface ContactsActions {
  addContact: (name: string, address: string, ensName?: string) => Contact;
  updateContact: (
    id: string,
    updates: Partial<Pick<Contact, "name" | "address" | "ensName">>,
  ) => void;
  removeContact: (id: string) => void;
  getContactByAddress: (address: string) => Contact | undefined;
  getContactById: (id: string) => Contact | undefined;
}

/**
 * Contacts store
 */
export const useContactsStore = create<ContactsState & ContactsActions>()(
  persist(
    (set, get) => ({
      contacts: [],

      addContact: (name: string, address: string, ensName?: string) => {
        const normalizedAddress = address.toLowerCase();

        // Check if contact with this address already exists
        const existing = get().contacts.find(
          (c) => c.address.toLowerCase() === normalizedAddress,
        );

        if (existing) {
          // Update existing contact
          get().updateContact(existing.id, { name, address, ensName });
          return { ...existing, name, address, ensName, updatedAt: Date.now() };
        }

        const newContact: Contact = {
          id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: name.trim(),
          address: address,
          ...(ensName ? { ensName } : {}),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          contacts: [...state.contacts, newContact],
        }));

        return newContact;
      },

      updateContact: (
        id: string,
        updates: Partial<Pick<Contact, "name" | "address" | "ensName">>,
      ) => {
        set((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === id
              ? {
                  ...contact,
                  ...updates,
                  name: updates.name?.trim() || contact.name,
                  updatedAt: Date.now(),
                }
              : contact,
          ),
        }));
      },

      removeContact: (id: string) => {
        set((state) => ({
          contacts: state.contacts.filter((c) => c.id !== id),
        }));
      },

      getContactByAddress: (address: string) => {
        return get().contacts.find(
          (c) => c.address.toLowerCase() === address.toLowerCase(),
        );
      },

      getContactById: (id: string) => {
        return get().contacts.find((c) => c.id === id);
      },
    }),
    {
      name: "zap-contacts-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/**
 * Hook to get all contacts sorted by name
 */
export function useContacts() {
  const contacts = useContactsStore((s) => s.contacts);
  return useMemo(
    () => [...contacts].sort((a, b) => a.name.localeCompare(b.name)),
    [contacts],
  );
}

/**
 * Hook to get a contact by address
 */
export function useContactByAddress(address: string) {
  return useContactsStore((s) => s.getContactByAddress(address));
}

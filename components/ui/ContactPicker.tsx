import { useColorScheme } from "@/hooks/use-color-scheme";
import { ENSService } from "@/services/ens";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { Contact, useContacts } from "@/store/contacts";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
    FlatList,
    Image,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const AVATAR_COLORS = [
  "#569F8C", "#8B5CF6", "#3B82F6", "#F59E0B",
  "#EC4899", "#10B981", "#6366F1",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface ContactPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectContact: (contact: Contact) => void;
}

/**
 * Modal to pick a contact from the saved contacts list.
 * Shows ENS avatars where available.
 */
export function ContactPicker({
  visible,
  onClose,
  onSelectContact,
}: ContactPickerProps) {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const titleColor = isLight ? "#0F172A" : "#FFFFFF";
  const iconColor = isLight ? "#334155" : "#FFFFFF";
  const panelBorder = isLight ? "#D5E2DC" : "#1E2E29";
  const searchBg = isLight ? "#FFFFFF" : "#1E2E29";
  const searchText = isLight ? "#0F172A" : "#FFFFFF";
  const searchPlaceholder = isLight ? "#94A3B8" : "#6B7280";
  const rowBg = isLight ? "#FFFFFF" : "#1A2820";
  const rowBorder = isLight ? "#DCE8E2" : "transparent";
  const nameColor = isLight ? "#11181C" : "#FFFFFF";
  const addressColor = isLight ? "#64748B" : "#9CA3AF";
  const mutedIcon = isLight ? "#94A3B8" : "#6B7280";
  const contacts = useContacts();
  const [search, setSearch] = useState("");

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const query = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.address.toLowerCase().includes(query) ||
        c.ensName?.toLowerCase().includes(query),
    );
  }, [contacts, search]);

  const handleSelect = (contact: Contact) => {
    onSelectContact(contact);
    setSearch("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: bg }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: titleColor }]}>Select Contact</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={iconColor} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[styles.searchContainer, { backgroundColor: searchBg, borderColor: panelBorder }]}> 
            <Ionicons name="search" size={18} color={searchPlaceholder} />
            <TextInput
              style={[styles.searchInput, { color: searchText }]}
              placeholder="Search contacts or ENS…"
              placeholderTextColor={searchPlaceholder}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={searchPlaceholder} />
              </TouchableOpacity>
            )}
          </View>

          {/* Contacts List */}
          {filteredContacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={isLight ? "#94A3B8" : "#4B5563"} />
              <Text style={[styles.emptyText, { color: addressColor }]}> 
                {contacts.length === 0
                  ? "No contacts saved yet"
                  : "No contacts match your search"}
              </Text>
              <Text style={[styles.emptyHint, { color: mutedIcon }]}> 
                {contacts.length === 0
                  ? "Save a recipient after sending to add them to your contacts"
                  : "Try a different search term"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ContactPickerRow
                  contact={item}
                  onPress={() => handleSelect(item)}
                  isLight={isLight}
                />
              )}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function ContactPickerRow({
  contact,
  onPress,
  isLight,
}: {
  contact: Contact;
  onPress: () => void;
  isLight: boolean;
}) {
  const color = avatarColor(contact.name);
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!contact.ensName) return;
    let cancelled = false;
    ENSService.getProfile(contact.ensName).then((p) => {
      if (!cancelled && p?.avatar) setAvatar(p.avatar);
    });
    return () => { cancelled = true; };
  }, [contact.ensName]);

  return (
    <TouchableOpacity
      style={[
        styles.contactItem,
        {
          backgroundColor: isLight ? "#FFFFFF" : "#1A2820",
          borderWidth: isLight ? 1 : 0,
          borderColor: isLight ? "#DCE8E2" : "transparent",
        },
      ]}
      onPress={onPress}
    >
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.contactAvatarImage} />
      ) : (
        <View style={[styles.contactAvatar, { backgroundColor: color }]}>
          <Text style={styles.contactAvatarText}>
            {contact.name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.contactInfo}>
        <Text style={[styles.contactName, { color: isLight ? "#11181C" : "#FFFFFF" }]}>{contact.name}</Text>
        {contact.ensName ? (
          <Text style={styles.contactEns}>{contact.ensName}</Text>
        ) : (
          <Text style={[styles.contactAddress, { color: isLight ? "#64748B" : "#9CA3AF" }]}> 
            {contact.address.slice(0, 8)}…{contact.address.slice(-6)}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={isLight ? "#94A3B8" : "#6B7280"} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: "#0F1512",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "80%",
    minHeight: 300,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1E2E29",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  contactAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  contactAvatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  contactEns: {
    color: "#569F8C",
    fontSize: 13,
    fontWeight: "500",
  },
  contactAddress: {
    fontSize: 13,
    fontFamily: "monospace",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 16,
    marginTop: 16,
    textAlign: "center",
  },
  emptyHint: {
    color: "#6B7280",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
});

export default ContactPicker;

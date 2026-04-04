import { Contact, useContacts } from "@/store/contacts";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface ContactPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectContact: (contact: Contact) => void;
}

/**
 * Modal to pick a contact from the saved contacts list
 */
export function ContactPicker({
  visible,
  onClose,
  onSelectContact,
}: ContactPickerProps) {
  const contacts = useContacts();
  const [search, setSearch] = useState("");

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const query = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.address.toLowerCase().includes(query),
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
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Contact</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search contacts..."
              placeholderTextColor="#6B7280"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={20} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          {/* Contacts List */}
          {filteredContacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#4B5563" />
              <Text style={styles.emptyText}>
                {contacts.length === 0
                  ? "No contacts saved yet"
                  : "No contacts match your search"}
              </Text>
              <Text style={styles.emptyHint}>
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
                <TouchableOpacity
                  style={styles.contactItem}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactAvatarText}>
                      {item.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{item.name}</Text>
                    <Text style={styles.contactAddress}>
                      {item.address.slice(0, 8)}...{item.address.slice(-6)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: "#1E2E29",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    minHeight: 300,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#569F8C",
    alignItems: "center",
    justifyContent: "center",
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  contactAddress: {
    color: "#9CA3AF",
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

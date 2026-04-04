import { Contact, useContacts, useContactsStore } from "@/store/contacts";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ContactsSettingsScreen() {
  const router = useRouter();
  const contacts = useContacts();
  const { addContact, updateContact, removeContact } = useContactsStore();

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");

  const handleAddNew = () => {
    setEditingContact(null);
    setEditName("");
    setEditAddress("");
    setShowEditModal(true);
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setEditName(contact.name);
    setEditAddress(contact.address);
    setShowEditModal(true);
  };

  const handleSave = () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Please enter a name");
      return;
    }
    if (
      !editAddress.trim() ||
      !editAddress.startsWith("0x") ||
      editAddress.length !== 42
    ) {
      Alert.alert("Error", "Please enter a valid Ethereum address");
      return;
    }

    if (editingContact) {
      updateContact(editingContact.id, {
        name: editName.trim(),
        address: editAddress.trim(),
      });
    } else {
      addContact(editName.trim(), editAddress.trim());
    }

    setShowEditModal(false);
    setEditingContact(null);
  };

  const handleDelete = (contact: Contact) => {
    Alert.alert(
      "Delete Contact",
      `Are you sure you want to delete "${contact.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => removeContact(contact.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contacts</Text>
        <TouchableOpacity onPress={handleAddNew}>
          <Ionicons name="add" size={24} color="#569F8C" />
        </TouchableOpacity>
      </View>

      {/* Contacts List */}
      {contacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#4B5563" />
          <Text style={styles.emptyText}>No contacts yet</Text>
          <Text style={styles.emptyHint}>
            Save recipients when sending to quickly access them later
          </Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddNew}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add Contact</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.contactItem}>
              <TouchableOpacity
                style={styles.contactMain}
                onPress={() => handleEdit(item)}
              >
                <View style={styles.contactAvatar}>
                  <Text style={styles.contactAvatarText}>
                    {item.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{item.name}</Text>
                  <Text style={styles.contactAddress}>
                    {item.address.slice(0, 10)}...{item.address.slice(-8)}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(item)}
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Edit/Add Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingContact ? "Edit Contact" : "Add Contact"}
              </Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Contact name"
                placeholderTextColor="#6B7280"
                value={editName}
                onChangeText={setEditName}
                autoCapitalize="words"
              />

              <Text style={styles.inputLabel}>Address</Text>
              <TextInput
                style={[styles.input, styles.addressInput]}
                placeholder="0x..."
                placeholderTextColor="#6B7280"
                value={editAddress}
                onChangeText={setEditAddress}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>
                  {editingContact ? "Save Changes" : "Add Contact"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  contactMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#569F8C",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  contactAvatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  contactAddress: {
    color: "#9CA3AF",
    fontSize: 13,
    fontFamily: "monospace",
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptyHint: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#569F8C",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
    gap: 8,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1E2E29",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 16,
    color: "#FFFFFF",
    fontSize: 16,
    marginBottom: 16,
  },
  addressInput: {
    fontFamily: "monospace",
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: "#569F8C",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

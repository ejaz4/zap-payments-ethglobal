import { useAccentColor, tintedBackground } from "@/store/appearance";
import { ENSProfile, ENSService } from "@/services/ens";
import { AddressInput } from "@/components/ui/AddressInput";
import { Contact, useContacts, useContactsStore } from "@/store/contacts";
import { useLastActive } from "@/hooks/use-ens";
import { useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { ChainId } from "@/app/profiles/client";

// ─── Avatar colour ──────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#569F8C",
  "#8B5CF6",
  "#3B82F6",
  "#F59E0B",
  "#EC4899",
  "#10B981",
  "#6366F1",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function formatNonce(nonce: number): string {
  if (nonce === 0) return "No activity";
  if (nonce === 1) return "1 transaction";
  if (nonce < 100) return `${nonce} transactions`;
  if (nonce < 1000) return `${nonce} txns`;
  return `${(nonce / 1000).toFixed(1)}k txns`;
}

// ─── Section data ────────────────────────────────────────────────────────────

interface Section {
  title: string;
  data: Contact[];
}

function buildSections(contacts: Contact[], query: string): Section[] {
  const filtered = query.trim()
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.address.toLowerCase().includes(query.toLowerCase()) ||
          c.ensName?.toLowerCase().includes(query.toLowerCase()),
      )
    : contacts;

  const map = new Map<string, Contact[]>();
  for (const contact of filtered) {
    const letter = contact.name[0]?.toUpperCase() ?? "#";
    if (!map.has(letter)) map.set(letter, []);
    map.get(letter)!.push(contact);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({ title, data }));
}

// ─── Social platform meta ────────────────────────────────────────────────────

const SOCIAL_META: Record<string, { label: string; icon: string; color: string }> = {
  twitter:  { label: "X / Twitter",  icon: "logo-twitter", color: "#1DA1F2" },
  github:   { label: "GitHub",       icon: "logo-github",  color: "#9CA3AF" },
  website:  { label: "Website",      icon: "globe-outline", color: "#569F8C" },
  email:    { label: "Email",        icon: "mail-outline",  color: "#F59E0B" },
  telegram: { label: "Telegram",     icon: "paper-plane-outline", color: "#2CA5E0" },
  discord:  { label: "Discord",      icon: "chatbubble-ellipses-outline", color: "#5865F2" },
  reddit:   { label: "Reddit",       icon: "logo-reddit",  color: "#FF4500" },
};

const CHAIN_LABELS: Record<string, string> = {
  [`${ChainId.mainnet}`]:  "Ethereum",
  [`${ChainId.base}`]:     "Base",
  [`${ChainId.optimism}`]: "Optimism",
  [`${ChainId.arbitrum}`]: "Arbitrum",
  [`${ChainId.polygon}`]:  "Polygon",
  [`${ChainId.bsc}`]:      "BNB Chain",
  solana:                   "Solana",
};

const CHAIN_ICONS: Record<string, string> = {
  [`${ChainId.mainnet}`]:  "🔷",
  [`${ChainId.base}`]:     "🔵",
  [`${ChainId.optimism}`]: "🔴",
  [`${ChainId.arbitrum}`]: "🌀",
  [`${ChainId.polygon}`]:  "🟣",
  [`${ChainId.bsc}`]:      "🟡",
  solana:                   "☀️",
};

// ─── Last Active Badge ──────────────────────────────────────────────────────

function LastActiveBadge({ address }: { address: string }) {
  const { nonce, loading } = useLastActive(address);

  if (loading) return null;
  if (nonce === null) return null;

  return (
    <View style={badgeStyles.container}>
      <View style={[badgeStyles.dot, nonce > 0 ? badgeStyles.dotActive : badgeStyles.dotInactive]} />
      <Text style={[badgeStyles.text, nonce > 0 ? badgeStyles.textActive : badgeStyles.textInactive]}>
        {formatNonce(nonce)}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: "#10B981",
  },
  dotInactive: {
    backgroundColor: "#6B7280",
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
  },
  textActive: {
    color: "#10B981",
  },
  textInactive: {
    color: "#6B7280",
  },
});

// ─── Contact Detail Sheet (iOS-style) ───────────────────────────────────────

function ContactDetail({
  contact,
  onClose,
  onEdit,
  onDelete,
  onSend,
}: {
  contact: Contact;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSend: () => void;
}) {
  const accentColor = useAccentColor();
  const insets = useSafeAreaInsets();
  const color = avatarColor(contact.name);
  const [profile, setProfile] = useState<ENSProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!contact.ensName) return;
    setLoadingProfile(true);
    ENSService.getProfile(contact.ensName).then((p) => {
      setProfile(p);
      setLoadingProfile(false);
    });
  }, [contact.ensName]);

  const handleCopy = useCallback(async (address: string) => {
    await Clipboard.setStringAsync(address);
    setCopiedAddress(address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedAddress(null), 2000);
  }, []);

  const handleSocial = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  // Addresses to display: from ENS profile first, fallback to stored address
  const addresses = profile?.addresses.length
    ? profile.addresses
    : [{ chainId: ChainId.mainnet as ChainId | "solana", chainName: "Ethereum", address: contact.address }];

  const displayName = profile?.displayName || contact.name;

  return (
    <View style={[detailStyles.container, { paddingBottom: insets.bottom + 16 }]}>
      {/* Handle */}
      <View style={detailStyles.handle} />

      {/* Close / Edit / Delete row */}
      <View style={detailStyles.topBar}>
        <TouchableOpacity onPress={onClose} style={detailStyles.topBtn}>
          <Ionicons name="close" size={22} color="#9CA3AF" />
        </TouchableOpacity>
        <View style={detailStyles.topActions}>
          <TouchableOpacity onPress={onEdit} style={detailStyles.topBtn}>
            <Ionicons name="create-outline" size={22} color={accentColor} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              onClose();
              setTimeout(onDelete, 300);
            }}
            style={detailStyles.topBtn}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header banner (if profile has header image) */}
        {profile?.header && (
          <Image
            source={{ uri: profile.header }}
            style={detailStyles.headerBanner}
            resizeMode="cover"
          />
        )}

        {/* Avatar & Identity */}
        <View style={[detailStyles.avatarSection, profile?.header ? { marginTop: -48 } : undefined]}>
          {profile?.avatar ? (
            <Image
              source={{ uri: profile.avatar }}
              style={[detailStyles.avatarImage, { borderColor: color }]}
            />
          ) : (
            <View style={[detailStyles.avatarLarge, { backgroundColor: color }]}>
              <Text style={detailStyles.avatarLargeText}>
                {contact.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}

          <Text style={detailStyles.name}>{displayName}</Text>
          {contact.ensName && (
            <Text style={detailStyles.ensName}>{contact.ensName}</Text>
          )}

          {/* Location */}
          {profile?.location && (
            <View style={detailStyles.locationRow}>
              <Ionicons name="location-outline" size={14} color="#9CA3AF" />
              <Text style={detailStyles.locationText}>{profile.location}</Text>
            </View>
          )}

          {/* Description / Bio */}
          {profile?.description && (
            <Text style={detailStyles.description}>{profile.description}</Text>
          )}

          {/* Keywords / Tags */}
          {profile?.keywords && profile.keywords.length > 0 && (
            <View style={detailStyles.tagsRow}>
              {profile.keywords.slice(0, 5).map((kw) => (
                <View key={kw} style={detailStyles.tag}>
                  <Text style={detailStyles.tagText}>{kw}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Notice */}
          {profile?.notice && (
            <View style={detailStyles.noticeBox}>
              <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
              <Text style={detailStyles.noticeText}>{profile.notice}</Text>
            </View>
          )}

          {/* Last Active */}
          <View style={{ marginTop: 8 }}>
            <LastActiveBadge address={contact.address} />
          </View>

          {loadingProfile && !profile && (
            <View style={detailStyles.loadingRow}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={detailStyles.loadingText}>Loading ENS profile…</Text>
            </View>
          )}
        </View>

        {/* Action buttons - iOS style circular buttons */}
        <View style={detailStyles.actionRow}>
          <TouchableOpacity style={detailStyles.actionBtn} onPress={onSend}>
            <View style={[detailStyles.actionIcon, { backgroundColor: accentColor }]}>
              <Ionicons name="paper-plane-outline" size={22} color="#FFFFFF" />
            </View>
            <Text style={detailStyles.actionLabel}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={detailStyles.actionBtn}
            onPress={() => handleCopy(contact.address)}
          >
            <View style={[detailStyles.actionIcon, { backgroundColor: accentColor }]}>
              <Ionicons
                name={copiedAddress === contact.address ? "checkmark" : "copy-outline"}
                size={22}
                color="#FFFFFF"
              />
            </View>
            <Text style={detailStyles.actionLabel}>Copy</Text>
          </TouchableOpacity>

          {profile?.socials.find((s) => s.platform === "twitter") && (
            <TouchableOpacity
              style={detailStyles.actionBtn}
              onPress={() => {
                const twitter = profile?.socials.find((s) => s.platform === "twitter");
                if (twitter) handleSocial(twitter.url);
              }}
            >
              <View style={[detailStyles.actionIcon, { backgroundColor: "#1DA1F2" }]}>
                <Ionicons name="logo-twitter" size={22} color="#FFFFFF" />
              </View>
              <Text style={detailStyles.actionLabel}>Twitter</Text>
            </TouchableOpacity>
          )}

          {profile?.socials.find((s) => s.platform === "website") && (
            <TouchableOpacity
              style={detailStyles.actionBtn}
              onPress={() => {
                const web = profile?.socials.find((s) => s.platform === "website");
                if (web) handleSocial(web.url);
              }}
            >
              <View style={[detailStyles.actionIcon, { backgroundColor: "#6366F1" }]}>
                <Ionicons name="globe-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={detailStyles.actionLabel}>Website</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Addresses section - iOS grouped list style */}
        <View style={detailStyles.section}>
          <Text style={detailStyles.sectionTitle}>ADDRESSES</Text>
          <View style={detailStyles.groupedCard}>
            {addresses.map((item, index) => {
              const chainKey = String(item.chainId);
              return (
                <View
                  key={`${item.chainId}_${item.address}`}
                  style={[
                    detailStyles.groupedRow,
                    index > 0 && detailStyles.groupedRowBorder,
                  ]}
                >
                  <Text style={detailStyles.chainIcon}>
                    {CHAIN_ICONS[chainKey] ?? "🔗"}
                  </Text>
                  <View style={detailStyles.groupedRowInfo}>
                    <Text style={detailStyles.groupedRowLabel}>
                      {CHAIN_LABELS[chainKey] ?? item.chainName}
                    </Text>
                    <Text style={detailStyles.groupedRowValue} numberOfLines={1}>
                      {shortAddress(item.address)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleCopy(item.address)}
                    style={detailStyles.copyBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={copiedAddress === item.address ? "checkmark-circle" : "copy-outline"}
                      size={18}
                      color={copiedAddress === item.address ? accentColor : "#6B7280"}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        {/* Social links section - iOS grouped list style */}
        {profile && profile.socials.length > 0 && (
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>LINKS</Text>
            <View style={detailStyles.groupedCard}>
              {profile.socials.map((social, index) => {
                const meta = SOCIAL_META[social.platform];
                if (!meta) return null;
                return (
                  <TouchableOpacity
                    key={social.platform}
                    style={[
                      detailStyles.groupedRow,
                      index > 0 && detailStyles.groupedRowBorder,
                    ]}
                    onPress={() => handleSocial(social.url)}
                    activeOpacity={0.7}
                  >
                    <View style={[detailStyles.socialIconCircle, { backgroundColor: meta.color + "20" }]}>
                      <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                    </View>
                    <View style={detailStyles.groupedRowInfo}>
                      <Text style={detailStyles.groupedRowLabel}>{meta.label}</Text>
                      <Text style={[detailStyles.groupedRowValue, { color: meta.color, fontFamily: undefined }]}>
                        {social.handle}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#374151" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Info section - ENS metadata */}
        {contact.ensName && (
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>ENS INFO</Text>
            <View style={detailStyles.groupedCard}>
              <View style={detailStyles.groupedRow}>
                <Ionicons name="finger-print-outline" size={20} color={accentColor} style={{ marginRight: 12 }} />
                <View style={detailStyles.groupedRowInfo}>
                  <Text style={detailStyles.groupedRowLabel}>ENS Name</Text>
                  <Text style={[detailStyles.groupedRowValue, { color: accentColor, fontFamily: undefined }]}>
                    {contact.ensName}
                  </Text>
                </View>
              </View>
              <View style={[detailStyles.groupedRow, detailStyles.groupedRowBorder]}>
                <Ionicons name="calendar-outline" size={20} color="#9CA3AF" style={{ marginRight: 12 }} />
                <View style={detailStyles.groupedRowInfo}>
                  <Text style={detailStyles.groupedRowLabel}>Added</Text>
                  <Text style={detailStyles.groupedRowValue}>
                    {new Date(contact.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ContactsScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const router = useRouter();
  const contacts = useContacts();
  const { addContact, updateContact, removeContact } = useContactsStore();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);

  const [search, setSearch] = useState("");
  const sections = useMemo(
    () => buildSections(contacts, search),
    [contacts, search],
  );

  // Detail sheet
  const [detailContact, setDetailContact] = useState<Contact | null>(null);

  // Add/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  const openAdd = () => {
    setEditingContact(null);
    setEditName("");
    setEditAddress("");
    setResolvedAddress(null);
    setShowModal(true);
  };

  const openEdit = (contact: Contact) => {
    setDetailContact(null);
    setEditingContact(contact);
    setEditName(contact.name);
    setEditAddress(contact.ensName ?? contact.address);
    setResolvedAddress(contact.address);
    setTimeout(() => setShowModal(true), 300);
  };

  const handleSave = () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Please enter a name");
      return;
    }
    if (!resolvedAddress) {
      Alert.alert(
        "Error",
        editAddress.trim()
          ? "Could not resolve this address or ENS name"
          : "Please enter an address or ENS name",
      );
      return;
    }

    const ensName = ENSService.isENSName(editAddress.trim())
      ? editAddress.trim()
      : undefined;

    if (editingContact) {
      updateContact(editingContact.id, {
        name: editName.trim(),
        address: resolvedAddress,
        ensName,
      });
    } else {
      addContact(editName.trim(), resolvedAddress, ensName);
    }

    setShowModal(false);
  };

  const handleDelete = (contact: Contact) => {
    Alert.alert(
      "Delete Contact",
      `Remove "${contact.name}" from your contacts?`,
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
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contacts</Text>
        <TouchableOpacity onPress={openAdd} style={styles.headerBtn}>
          <Ionicons name="person-add-outline" size={22} color={accentColor} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, address, or ENS…"
          placeholderTextColor="#6B7280"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {contacts.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={40} color={accentColor} />
          </View>
          <Text style={styles.emptyTitle}>No contacts yet</Text>
          <Text style={styles.emptyHint}>
            Add wallets you send to often — supports ENS names like vitalik.eth
          </Text>
          <TouchableOpacity style={[styles.emptyButton, { backgroundColor: accentColor }]} onPress={openAdd}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Add your first contact</Text>
          </TouchableOpacity>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptyHint}>Try a different name or address</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <ContactRow
              contact={item}
              onPress={() => setDetailContact(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Contact detail sheet */}
      <Modal
        visible={detailContact !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailContact(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setDetailContact(null)}
          />
          {detailContact && (
            <ContactDetail
              contact={detailContact}
              onClose={() => setDetailContact(null)}
              onEdit={() => openEdit(detailContact)}
              onDelete={() => {
                setDetailContact(null);
                setTimeout(() => handleDelete(detailContact), 300);
              }}
              onSend={() => {
                setDetailContact(null);
                setTimeout(() => {
                  router.push({
                    pathname: "/send/transfer",
                    params: { address: detailContact.address },
                  } as any);
                }, 300);
              }}
            />
          )}
        </View>
      </Modal>

      {/* Add / Edit modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {editingContact ? "Edit Contact" : "New Contact"}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetBody}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.nameInput}
                placeholder="e.g. Alice"
                placeholderTextColor="#6B7280"
                value={editName}
                onChangeText={setEditName}
                autoCapitalize="words"
                returnKeyType="next"
              />

              <AddressInput
                label="Wallet address or ENS name"
                value={editAddress}
                onChangeText={setEditAddress}
                onResolvedAddress={setResolvedAddress}
                chainId={selectedChainId as ChainId}
              />

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: accentColor },
                  (!editName.trim() || !resolvedAddress) && styles.saveBtnDisabled,
                ]}
                onPress={handleSave}
                disabled={!editName.trim() || !resolvedAddress}
              >
                <Text style={styles.saveBtnText}>
                  {editingContact ? "Save Changes" : "Add Contact"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Contact row with ENS avatar ────────────────────────────────────────────

function ContactRow({
  contact,
  onPress,
}: {
  contact: Contact;
  onPress: () => void;
}) {
  const color = avatarColor(contact.name);
  const [avatar, setAvatar] = useState<string | null>(null);
  const subtitle = contact.ensName ?? `${contact.address.slice(0, 10)}…${contact.address.slice(-8)}`;
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Eagerly load ENS avatar for contacts with ENS names
  useEffect(() => {
    if (!contact.ensName) return;
    let cancelled = false;
    ENSService.getProfile(contact.ensName).then((p) => {
      if (!cancelled && p?.avatar) setAvatar(p.avatar);
    });
    return () => { cancelled = true; };
  }, [contact.ensName]);

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        activeOpacity={1}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 20, stiffness: 400 });
        }}
      >
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: color }]}>
            <Text style={styles.avatarText}>
              {contact.name.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{contact.name}</Text>
          <View style={styles.rowSubtitleRow}>
            <Text style={styles.rowAddress} numberOfLines={1}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.rowRight}>
          <LastActiveBadge address={contact.address} />
          <Ionicons name="chevron-forward" size={18} color="#374151" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 14,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 3,
  },
  rowSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowAddress: {
    color: "#9CA3AF",
    fontSize: 13,
    fontFamily: "monospace",
    flex: 1,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#1E2E29",
    marginLeft: 62,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyHint: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#569F8C",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: "#1A2820",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2D3D38",
  },
  sheetTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  sheetBody: {
    padding: 20,
  },
  fieldLabel: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: "#0F1512",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#FFFFFF",
    fontSize: 16,
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: "#569F8C",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});

const detailStyles = StyleSheet.create({
  container: {
    backgroundColor: "#0F1512",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "92%",
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
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topActions: {
    flexDirection: "row",
    gap: 4,
  },
  headerBanner: {
    width: "100%",
    height: 120,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  avatarSection: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    marginBottom: 16,
  },
  avatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarLargeText: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700",
  },
  name: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  ensName: {
    color: "#569F8C",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  locationText: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  description: {
    color: "#D1D5DB",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  tag: {
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "500",
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F59E0B10",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    marginHorizontal: 12,
  },
  noticeText: {
    color: "#F59E0B",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  loadingText: {
    color: "#6B7280",
    fontSize: 13,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1E2E29",
    marginHorizontal: 24,
  },
  actionBtn: {
    alignItems: "center",
    gap: 6,
    minWidth: 56,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#569F8C",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "500",
  },
  section: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  groupedCard: {
    backgroundColor: "#1A2820",
    borderRadius: 14,
    overflow: "hidden",
  },
  groupedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  groupedRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2D3D38",
  },
  groupedRowInfo: {
    flex: 1,
    marginLeft: 10,
  },
  groupedRowLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 1,
  },
  groupedRowValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
    fontFamily: "monospace",
  },
  chainIcon: {
    fontSize: 18,
    width: 26,
    textAlign: "center",
  },
  socialIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  copyBtn: {
    paddingLeft: 12,
  },
});

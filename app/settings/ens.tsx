import { ChainId } from "@/app/profiles/client";
import { useENSName, useENSProfile } from "@/hooks/use-ens";
import { ENSService } from "@/services/ens";
import { WalletService } from "@/services/wallet";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useSelectedAccount } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SOCIAL_META: Record<string, { label: string; icon: string; color: string; key: string }> = {
  twitter:  { label: "X / Twitter",  icon: "logo-twitter", color: "#1DA1F2", key: "com.twitter" },
  github:   { label: "GitHub",       icon: "logo-github",  color: "#9CA3AF", key: "com.github" },
  website:  { label: "Website",      icon: "globe-outline", color: "#569F8C", key: "url" },
  email:    { label: "Email",        icon: "mail-outline",  color: "#F59E0B", key: "email" },
  telegram: { label: "Telegram",     icon: "paper-plane-outline", color: "#2CA5E0", key: "org.telegram" },
  discord:  { label: "Discord",      icon: "chatbubble-ellipses-outline", color: "#5865F2", key: "com.discord" },
  reddit:   { label: "Reddit",       icon: "logo-reddit",  color: "#FF4500", key: "com.reddit" },
};

const EDITABLE_TEXT_RECORDS = [
  { key: "description", label: "Bio", placeholder: "A short bio about yourself", icon: "document-text-outline" },
  { key: "avatar", label: "Avatar URL", placeholder: "https://... or eip155:1/erc721:0x.../123", icon: "image-outline" },
  { key: "header", label: "Header Image URL", placeholder: "https://...", icon: "image-outline" },
  { key: "display", label: "Display Name", placeholder: "Your display name", icon: "person-outline" },
  { key: "location", label: "Location", placeholder: "New York, USA", icon: "location-outline" },
  { key: "url", label: "Website", placeholder: "https://yourwebsite.com", icon: "globe-outline" },
  { key: "com.twitter", label: "Twitter / X", placeholder: "@handle", icon: "logo-twitter" },
  { key: "com.github", label: "GitHub", placeholder: "username", icon: "logo-github" },
  { key: "email", label: "Email", placeholder: "you@example.com", icon: "mail-outline" },
  { key: "org.telegram", label: "Telegram", placeholder: "@handle", icon: "paper-plane-outline" },
  { key: "com.discord", label: "Discord", placeholder: "username#1234", icon: "chatbubble-ellipses-outline" },
  { key: "com.reddit", label: "Reddit", placeholder: "u/username", icon: "logo-reddit" },
  { key: "notice", label: "Public Notice", placeholder: "Any notice you want to share", icon: "megaphone-outline" },
  { key: "keywords", label: "Keywords", placeholder: "crypto, developer, artist", icon: "pricetags-outline" },
];

export default function ENSManagementScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const account = useSelectedAccount();
  const ensName = useENSName(account?.address, ChainId.mainnet);
  const { profile, loading: profileLoading, refresh: refreshProfile } = useENSProfile(ensName);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Solana linking
  const [solAddress, setSolAddress] = useState("");
  const [savingSol, setSavingSol] = useState(false);

  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const handleCopy = useCallback(async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedItem(key);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedItem(null), 2000);
  }, []);

  const startEdit = (key: string, currentValue: string) => {
    setEditingKey(key);
    setEditValue(currentValue);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const handleSaveRecord = async () => {
    if (!ensName || !editingKey || !account) return;

    setSaving(true);
    try {
      const signer = await WalletService.getSigner(account.address, ChainId.mainnet);
      if (!signer) {
        Alert.alert("Error", "Could not get wallet signer. Make sure you have the private key for this account.");
        return;
      }

      const result = await ENSService.setTextRecord(ensName, editingKey, editValue, signer);

      if ("error" in result) {
        Alert.alert("Error", result.error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", `Record "${editingKey}" updated successfully.`);
        cancelEdit();
        refreshProfile();
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save record");
    } finally {
      setSaving(false);
    }
  };

  const handleLinkSolana = async () => {
    if (!ensName || !solAddress || !account) return;

    setSavingSol(true);
    try {
      const signer = await WalletService.getSigner(account.address, ChainId.mainnet);
      if (!signer) {
        Alert.alert("Error", "Could not get wallet signer.");
        return;
      }

      const result = await ENSService.setSolanaAddress(ensName, solAddress, signer);

      if ("error" in result) {
        Alert.alert("Error", result.error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Solana address linked to your ENS name.");
        setSolAddress("");
        refreshProfile();
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to link Solana address");
    } finally {
      setSavingSol(false);
    }
  };

  if (!account) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ENS Names</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No account selected</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isEVM = account.accountType !== "solana";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ENS Identity</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* No ENS name */}
        {!ensName && !profileLoading && isEVM && (
          <View style={styles.noEnsCard}>
            <View style={styles.noEnsIcon}>
              <Ionicons name="finger-print-outline" size={40} color={accentColor} />
            </View>
            <Text style={styles.noEnsTitle}>No ENS Name</Text>
            <Text style={styles.noEnsDesc}>
              This wallet doesn't have a primary ENS name set.
              Register one at app.ens.domains to get started.
            </Text>
            <Text style={styles.noEnsAddress}>
              {account.address.slice(0, 12)}…{account.address.slice(-8)}
            </Text>
          </View>
        )}

        {!isEVM && (
          <View style={styles.noEnsCard}>
            <View style={styles.noEnsIcon}>
              <Text style={{ fontSize: 36 }}>☀️</Text>
            </View>
            <Text style={styles.noEnsTitle}>Solana Account</Text>
            <Text style={styles.noEnsDesc}>
              ENS names are Ethereum-based. Switch to an EVM account to manage ENS identity.
              You can link this Solana address to an ENS name from your EVM account.
            </Text>
          </View>
        )}

        {profileLoading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={accentColor} />
            <Text style={styles.loadingText}>Loading ENS profile…</Text>
          </View>
        )}

        {/* Profile header */}
        {ensName && profile && (
          <>
            <View style={styles.profileHeader}>
              {profile.avatar ? (
                <Image source={{ uri: profile.avatar }} style={[styles.profileAvatar, { borderColor: accentColor }]} />
              ) : (
                <View style={styles.profileAvatarPlaceholder}>
                  <Ionicons name="person" size={36} color={accentColor} />
                </View>
              )}
              <Text style={styles.profileName}>
                {profile.displayName || ensName}
              </Text>
              <Text style={[styles.profileEns, { color: accentColor }]}>{ensName}</Text>
              {profile.description && (
                <Text style={styles.profileDesc}>{profile.description}</Text>
              )}
              {profile.location && (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color="#9CA3AF" />
                  <Text style={styles.locationText}>{profile.location}</Text>
                </View>
              )}
            </View>

            {/* Current socials */}
            {profile.socials.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>CONNECTED ACCOUNTS</Text>
                <View style={styles.groupedCard}>
                  {profile.socials.map((social, i) => {
                    const meta = SOCIAL_META[social.platform];
                    if (!meta) return null;
                    return (
                      <View
                        key={social.platform}
                        style={[styles.groupedRow, i > 0 && styles.groupedRowBorder]}
                      >
                        <View style={[styles.socialIcon, { backgroundColor: meta.color + "20" }]}>
                          <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                        </View>
                        <View style={styles.groupedRowInfo}>
                          <Text style={styles.groupedRowLabel}>{meta.label}</Text>
                          <Text style={[styles.groupedRowValue, { color: meta.color }]}>
                            {social.handle}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => startEdit(meta.key, social.handle)}
                          style={styles.editBtn}
                        >
                          <Ionicons name="create-outline" size={18} color={accentColor} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Addresses */}
            {profile.addresses.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ADDRESSES ON RECORD</Text>
                <View style={styles.groupedCard}>
                  {profile.addresses.map((addr, i) => (
                    <View
                      key={`${addr.chainId}_${addr.address}`}
                      style={[styles.groupedRow, i > 0 && styles.groupedRowBorder]}
                    >
                      <Text style={styles.chainEmoji}>
                        {addr.chainId === "solana" ? "☀️" : "🔷"}
                      </Text>
                      <View style={styles.groupedRowInfo}>
                        <Text style={styles.groupedRowLabel}>{addr.chainName}</Text>
                        <Text style={styles.groupedRowValueMono} numberOfLines={1}>
                          {addr.address.slice(0, 10)}…{addr.address.slice(-8)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleCopy(addr.address, `addr_${addr.chainId}`)}
                        style={styles.editBtn}
                      >
                        <Ionicons
                          name={copiedItem === `addr_${addr.chainId}` ? "checkmark" : "copy-outline"}
                          size={18}
                          color={copiedItem === `addr_${addr.chainId}` ? "#10B981" : "#6B7280"}
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Link Solana address */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>LINK SOLANA ADDRESS</Text>
              <View style={styles.groupedCard}>
                <View style={styles.linkSolCard}>
                  <Text style={styles.linkSolDesc}>
                    Link a Solana address to your ENS name so others can send you SOL using your .eth name.
                  </Text>
                  {profile.solanaAddress && (
                    <View style={styles.currentSolRow}>
                      <Text style={styles.currentSolLabel}>Current:</Text>
                      <Text style={styles.currentSolAddress} numberOfLines={1}>
                        {profile.solanaAddress}
                      </Text>
                    </View>
                  )}
                  <TextInput
                    style={styles.solInput}
                    placeholder="Solana address (base58)"
                    placeholderTextColor="#6B7280"
                    value={solAddress}
                    onChangeText={setSolAddress}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[styles.saveButton, { backgroundColor: accentColor }, (!solAddress.trim() || savingSol) && styles.saveButtonDisabled]}
                    onPress={handleLinkSolana}
                    disabled={!solAddress.trim() || savingSol}
                  >
                    {savingSol ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveButtonText}>
                        {profile.solanaAddress ? "Update SOL Address" : "Link SOL Address"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Edit records */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>EDIT RECORDS</Text>
              <Text style={styles.sectionHint}>
                Tap any record to edit it. Changes are written to Ethereum mainnet and require gas.
              </Text>
              <View style={styles.groupedCard}>
                {EDITABLE_TEXT_RECORDS.map((record, i) => {
                  const currentValue = getRecordValue(profile, record.key);
                  const isEditing = editingKey === record.key;

                  return (
                    <View
                      key={record.key}
                      style={[styles.groupedRow, i > 0 && styles.groupedRowBorder, isEditing && styles.editingRow]}
                    >
                      <Ionicons name={record.icon as any} size={20} color={accentColor} style={{ marginRight: 10, width: 24 }} />
                      <View style={styles.groupedRowInfo}>
                        <Text style={styles.groupedRowLabel}>{record.label}</Text>
                        {isEditing ? (
                          <View style={styles.editInputRow}>
                            <TextInput
                              style={[styles.editInput, { borderColor: accentColor }]}
                              value={editValue}
                              onChangeText={setEditValue}
                              placeholder={record.placeholder}
                              placeholderTextColor="#4B5563"
                              autoCapitalize="none"
                              autoCorrect={false}
                              autoFocus
                            />
                            <View style={styles.editActions}>
                              <TouchableOpacity onPress={cancelEdit} style={styles.editActionBtn}>
                                <Ionicons name="close" size={18} color="#EF4444" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={handleSaveRecord}
                                style={styles.editActionBtn}
                                disabled={saving}
                              >
                                {saving ? (
                                  <ActivityIndicator size="small" color="#10B981" />
                                ) : (
                                  <Ionicons name="checkmark" size={18} color="#10B981" />
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.groupedRowValue,
                              !currentValue && styles.groupedRowValueEmpty,
                            ]}
                            numberOfLines={1}
                          >
                            {currentValue || "Not set"}
                          </Text>
                        )}
                      </View>
                      {!isEditing && (
                        <TouchableOpacity
                          onPress={() => startEdit(record.key, currentValue || "")}
                          style={styles.editBtn}
                        >
                          <Ionicons name="create-outline" size={18} color={accentColor} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={{ height: 40 }} />
          </>
        )}

        {/* ENS name found but no profile yet (profile still loading or failed) */}
        {ensName && !profile && !profileLoading && (
          <View style={styles.noEnsCard}>
            <View style={styles.noEnsIcon}>
              <Ionicons name="finger-print-outline" size={40} color={accentColor} />
            </View>
            <Text style={styles.noEnsTitle}>{ensName}</Text>
            <Text style={styles.noEnsDesc}>
              Your ENS name was found but the profile couldn't be loaded.
              You may need to set a resolver for your name.
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: accentColor }]}
              onPress={refreshProfile}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getRecordValue(profile: any, key: string): string | undefined {
  if (!profile) return undefined;
  switch (key) {
    case "description": return profile.description;
    case "avatar": return profile.avatar;
    case "header": return profile.header;
    case "display": return profile.displayName;
    case "location": return profile.location;
    case "notice": return profile.notice;
    case "keywords": return profile.keywords?.join(", ");
    default: {
      // Social keys
      const social = profile.socials?.find((s: any) => {
        const map: Record<string, string> = {
          "com.twitter": "twitter",
          "com.github": "github",
          "url": "website",
          "email": "email",
          "org.telegram": "telegram",
          "com.discord": "discord",
          "com.reddit": "reddit",
        };
        return map[key] === s.platform;
      });
      return social?.handle;
    }
  }
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1E2E29",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 16,
  },
  noEnsCard: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  noEnsIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  noEnsTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  noEnsDesc: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 12,
  },
  noEnsAddress: {
    color: "#6B7280",
    fontSize: 13,
    fontFamily: "monospace",
  },
  retryBtn: {
    backgroundColor: "#569F8C",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 12,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  profileHeader: {
    alignItems: "center",
    paddingVertical: 24,
  },
  profileAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "#569F8C",
    marginBottom: 16,
  },
  profileAvatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  profileName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  profileEns: {
    color: "#569F8C",
    fontSize: 15,
    fontWeight: "500",
    marginTop: 4,
  },
  profileDesc: {
    color: "#D1D5DB",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  locationText: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  sectionHint: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 4,
    marginBottom: 10,
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
    marginLeft: 2,
  },
  groupedRowLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 1,
  },
  groupedRowValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  groupedRowValueEmpty: {
    color: "#4B5563",
    fontStyle: "italic",
  },
  groupedRowValueMono: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
    fontFamily: "monospace",
  },
  socialIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  chainEmoji: {
    fontSize: 18,
    width: 28,
    textAlign: "center",
    marginRight: 8,
  },
  editBtn: {
    paddingLeft: 12,
  },
  editingRow: {
    backgroundColor: "#0F1512",
    paddingVertical: 14,
  },
  editInputRow: {
    marginTop: 4,
  },
  editInput: {
    backgroundColor: "#1E2E29",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#569F8C",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  editActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
  },
  linkSolCard: {
    padding: 14,
  },
  linkSolDesc: {
    color: "#9CA3AF",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  currentSolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    backgroundColor: "#0F1512",
    borderRadius: 8,
    padding: 10,
  },
  currentSolLabel: {
    color: "#6B7280",
    fontSize: 12,
  },
  currentSolAddress: {
    color: "#F59E0B",
    fontSize: 12,
    fontFamily: "monospace",
    flex: 1,
  },
  solInput: {
    backgroundColor: "#0F1512",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 14,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: "#569F8C",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});

import { ChainId, EthersClient } from "@/app/profiles/client";
import { ChainBadgeMini } from "@/components/ui/NetworkSelector";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useENSAddress, useENSName, useENSProfile } from "@/hooks/use-ens";
import { ENSService } from "@/services/ens";
import { tintedBackground, tintedSurface, useAccentColor } from "@/store/appearance";
import { useContacts } from "@/store/contacts";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
} from "react-native";
import { Input } from "./Input";

// Solana addresses: base58, 32–44 chars, no 0/O/I/l
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function shortAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

interface AddressInputProps extends Omit<TextInputProps, "value" | "onChangeText"> {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  /**
   * Called whenever the resolved address changes.
   * null means the current value is not yet resolved or is invalid.
   */
  onResolvedAddress?: (address: string | null) => void;
  /**
   * Called when an "@chain" interop suffix is detected so the parent can
   * switch the active chain automatically.
   */
  onChainDetected?: (chainId: ChainId) => void;
  chainId: ChainId;
  /** When true, accepts Solana base58 addresses and skips ENS resolution */
  isSolana?: boolean;
  /** External error to show (e.g. from parent validation) */
  error?: string;
  /**
   * Enables the built-in recipient picker flow when provided.
   * Called when the picker pill is tapped (useful for haptics).
   */
  onContactsPress?: () => void;
}

/**
 * Address input field with built-in ENS resolution and profile preview.
 * Accepts raw 0x addresses, ENS names (e.g. "vitalik.eth"), and
 * ENS interoperable names (e.g. "alice@base", "vitalik.eth@optimism").
 * Shows a loading spinner while resolving, the resolved address, and
 * an ENS profile card with avatar when an ENS name is resolved.
 *
 * If onContactsPress is provided, the text input is replaced by a pill
 * that opens an integrated recipient picker screen.
 */
export function AddressInput({
  label = "Address or ENS name",
  value,
  onChangeText,
  onResolvedAddress,
  onChainDetected,
  chainId,
  isSolana = false,
  error: externalError,
  onContactsPress,
  ...props
}: AddressInputProps) {
  const contacts = useContacts();
  const accentColor = useAccentColor();
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const pickerBg = tintedBackground(accentColor, 0.06, isLight ? "#F6FBF8" : "#000000", scheme);
  const pickerHeaderBg = tintedSurface(accentColor, 0.08, isLight ? "#FFFFFF" : "#111111", scheme);
  const pickerPanelBg = tintedSurface(accentColor, 0.11, isLight ? "#FFFFFF" : "#111111", scheme);
  const pickerBorder = isLight ? "#D6E4DE" : "#24312C";
  const pickerText = isLight ? "#0F172A" : "#FFFFFF";
  const pickerMuted = isLight ? "#64748B" : "#9CA3AF";
  const pickerSubtle = isLight ? "#94A3B8" : "#6B7280";
  const chipBg = isLight ? "#FFFFFF" : pickerPanelBg;
  const selectedAccount = useSelectedAccount();
  const accounts = useWalletStore((s) => s.accounts);
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);
  const [pickerInput, setPickerInput] = useState(value);

  const usePickerPill = !!onContactsPress;

  const compatibleAccounts = useMemo(() => {
    const filtered = accounts.filter((account) => {
      const isAccountSolana = account.accountType === "solana";
      if (isSolana && !isAccountSolana) return false;
      if (!isSolana && isAccountSolana) return false;
      if (selectedAccount && account.address.toLowerCase() === selectedAccount.address.toLowerCase()) {
        return false;
      }
      return true;
    });

    const seen = new Set<string>();
    return filtered.filter((account) => {
      const key = account.address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [accounts, isSolana, selectedAccount]);

  const filteredContacts = useMemo(() => {
    if (!pickerInput.trim()) return contacts;
    const q = pickerInput.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.ensName?.toLowerCase().includes(q),
    );
  }, [contacts, pickerInput]);

  const openRecipientPicker = () => {
    onContactsPress?.();
    setPickerInput(value);
    setShowRecipientPicker(true);
  };

  const closeRecipientPicker = () => {
    setShowRecipientPicker(false);
    setPickerInput(value);
  };

  const commitRecipientValue = (nextValue: string) => {
    onChangeText(nextValue);
    setShowRecipientPicker(false);
  };

  // Solana path: try ENS resolution for SOL record if input looks like ENS
  const isSolanaAddress = isSolana && SOLANA_ADDRESS_RE.test(value.trim());
  const isENSInput = ENSService.isENSName(value.trim()) || ENSService.isInteropName(value.trim());

  // For Solana + ENS: resolve the SOL record
  const [solResolvedAddress, setSolResolvedAddress] = useState<string | null>(null);
  const [solLoading, setSolLoading] = useState(false);

  useEffect(() => {
    if (!isSolana || !isENSInput) {
      setSolResolvedAddress(null);
      setSolLoading(false);
      return;
    }
    let cancelled = false;
    setSolLoading(true);
    const timer = setTimeout(() => {
      ENSService.resolveSolana(value.trim()).then((addr) => {
        if (!cancelled) {
          setSolResolvedAddress(addr);
          setSolLoading(false);
        }
      });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isSolana, isENSInput, value]);

  const { address: resolved, loading: ensLoading, error: ensError, detectedChainId } = useENSAddress(
    isSolana ? "" : value, // don't run EVM ENS resolution for Solana (unless it's ENS name for SOL)
    chainId,
  );

  const loading = isSolana ? solLoading : ensLoading;

  // Fetch ENS profile for the dropdown preview
  const ensNameForProfile = isENSInput ? value.trim() : null;
  const { profile: ensProfile, loading: profileLoading } = useENSProfile(
    ensNameForProfile && !loading ? ensNameForProfile : null,
  );

  // Stable refs so callbacks don't need to be deps
  const onResolvedRef = useRef(onResolvedAddress);
  onResolvedRef.current = onResolvedAddress;
  const onChainDetectedRef = useRef(onChainDetected);
  onChainDetectedRef.current = onChainDetected;

  // Notify parent whenever resolved address changes
  useEffect(() => {
    if (isSolana) {
      if (isENSInput) {
        onResolvedRef.current?.(solResolvedAddress);
      } else {
        onResolvedRef.current?.(isSolanaAddress ? value.trim() : null);
      }
    } else {
      onResolvedRef.current?.(resolved);
    }
  }, [resolved, isSolana, isSolanaAddress, isENSInput, solResolvedAddress, value]);

  // Notify parent when an interop chain is detected (EVM only)
  useEffect(() => {
    if (!isSolana && detectedChainId !== null) {
      onChainDetectedRef.current?.(detectedChainId);
    }
  }, [detectedChainId, isSolana]);

  // Only show "invalid address" error after the user has paused typing
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    if (!value) return;
    const t = setTimeout(() => setSettled(true), 500);
    return () => clearTimeout(t);
  }, [value]);

  const isENS = !isSolana && isENSInput;
  const isAddress = !isSolana && EthersClient.isValidAddress(value);

  // Build the error to display
  let displayError = externalError;
  if (!displayError && settled && value) {
    if (isSolana) {
      if (!isSolanaAddress && !isENSInput) displayError = "Invalid Solana address";
      else if (isENSInput && !solLoading && !solResolvedAddress) displayError = "No Solana address record found for this ENS name";
    } else if (!loading) {
      if (ensError) {
        displayError = ensError;
      } else if (!resolved && !isAddress && !isENS) {
        displayError = "Invalid address";
      }
    }
  }

  const effectiveResolved = isSolana
    ? (isENSInput ? solResolvedAddress : (isSolanaAddress ? value.trim() : null))
    : resolved;

  const reverseEnsName = useENSName(!isSolana ? effectiveResolved : null, chainId);

  const inputValue = value.trim();
  const interop = !isSolana ? ENSService.parseInteropName(inputValue) : null;
  const forwardEnsName = !isSolana && isENSInput
    ? (interop?.name ?? inputValue)
    : null;
  const selectedEnsName = forwardEnsName ?? reverseEnsName;

  const selectedProfileName =
    selectedEnsName && ENSService.isENSName(selectedEnsName)
      ? selectedEnsName
      : null;
  const { profile: selectedProfile } = useENSProfile(selectedProfileName);

  const fallbackAddress = isSolana
    ? (isSolanaAddress ? inputValue : null)
    : (EthersClient.isValidAddress(inputValue) ? inputValue : null);
  const lookupAddress = effectiveResolved ?? fallbackAddress;

  const matchingContact = useMemo(() => {
    if (!inputValue && !lookupAddress) return null;
    const normalizedInput = inputValue.toLowerCase();
    const normalizedAddr = lookupAddress?.toLowerCase();
    return (
      contacts.find((c) => c.ensName?.toLowerCase() === normalizedInput) ??
      contacts.find((c) => !!normalizedAddr && c.address.toLowerCase() === normalizedAddr) ??
      null
    );
  }, [contacts, inputValue, lookupAddress]);

  const matchingAccount = useMemo(() => {
    if (!lookupAddress) return null;
    const normalizedAddr = lookupAddress.toLowerCase();
    return accounts.find((a) => a.address.toLowerCase() === normalizedAddr) ?? null;
  }, [accounts, lookupAddress]);

  const localWalletName = matchingContact?.name ?? matchingAccount?.name ?? null;

  const pillPrimaryText = selectedEnsName || localWalletName || (lookupAddress ? shortAddress(lookupAddress) : "Tap to choose recipient");
  const pillSecondaryText = selectedEnsName
    ? (localWalletName || (lookupAddress ? shortAddress(lookupAddress) : null))
    : (localWalletName && lookupAddress ? shortAddress(lookupAddress) : null);
  const pillInitials = initialsFromName(localWalletName || selectedEnsName || "");

  // Show the resolved address below the input only when an ENS name was typed
  const showResolved =
    !!effectiveResolved &&
    !loading &&
    value.toLowerCase() !== effectiveResolved.toLowerCase();

  // Show ENS profile dropdown when we have a resolved ENS name
  const showProfileCard = isENSInput && (ensProfile || profileLoading) && effectiveResolved;

  return (
    <View>
      {usePickerPill ? (
        <View style={styles.pillContainer}>
          {label ? <Text style={styles.pillLabel}>{label}</Text> : null}
          <TouchableOpacity
            style={styles.recipientPill}
            onPress={openRecipientPicker}
            activeOpacity={0.75}
          >
            <View style={styles.recipientPillLeft}>
              {selectedProfile?.avatar && value ? (
                <Image source={{ uri: selectedProfile.avatar }} style={styles.recipientPillAvatarImage} />
              ) : (
                <View style={styles.recipientPillAvatarFallback}>
                  {value ? (
                    <Text style={styles.recipientPillAvatarInitials}>{pillInitials}</Text>
                  ) : (
                    <Ionicons name="search" size={16} color="#9CA3AF" />
                  )}
                </View>
              )}
              <View style={styles.recipientPillTextWrap}>
                <Text style={[styles.recipientPillText, !value && styles.recipientPillPlaceholder]} numberOfLines={1}>
                  {pillPrimaryText}
                </Text>
                {!!pillSecondaryText && (
                  <Text style={styles.recipientPillSubText} numberOfLines={1}>
                    {pillSecondaryText}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <View style={{ flex: 1 }}>
            <Input
              label={label}
              value={value}
              onChangeText={onChangeText}
              placeholder={isSolana ? "SOL address or name.eth" : "0x..., name.eth, or alice@base"}
              autoCapitalize="none"
              autoCorrect={false}
              error={displayError}
              rightIcon={
                !loading ? (effectiveResolved ? "checkmark-circle" : undefined) : undefined
              }
              {...props}
            />
          </View>
        </View>
      )}

      {loading && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#569F8C" />
          <Text style={styles.resolvingText}>Resolving…</Text>
        </View>
      )}

      {/* ENS Profile preview card */}
      {showProfileCard && ensProfile && (
        <View style={styles.profileCard}>
          <View style={styles.profileCardInner}>
            {ensProfile.avatar ? (
              <Image source={{ uri: ensProfile.avatar }} style={styles.profileAvatar} />
            ) : (
              <View style={styles.profileAvatarPlaceholder}>
                <Ionicons name="person" size={18} color="#569F8C" />
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {ensProfile.displayName || ensProfile.name}
              </Text>
              {ensProfile.description && (
                <Text style={styles.profileDesc} numberOfLines={1}>
                  {ensProfile.description}
                </Text>
              )}
              <Text style={styles.profileAddress}>
                {effectiveResolved!.slice(0, 8)}…{effectiveResolved!.slice(-6)}
              </Text>
            </View>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
          </View>

          {/* Quick social badges */}
          {ensProfile.socials.length > 0 && (
            <View style={styles.profileSocials}>
              {ensProfile.socials.slice(0, 4).map((s) => {
                const meta: Record<string, { icon: string; color: string }> = {
                  twitter: { icon: "logo-twitter", color: "#1DA1F2" },
                  github: { icon: "logo-github", color: "#9CA3AF" },
                  website: { icon: "globe-outline", color: "#569F8C" },
                  discord: { icon: "chatbubble-ellipses-outline", color: "#5865F2" },
                  telegram: { icon: "paper-plane-outline", color: "#2CA5E0" },
                  email: { icon: "mail-outline", color: "#F59E0B" },
                  reddit: { icon: "logo-reddit", color: "#FF4500" },
                };
                const m = meta[s.platform];
                if (!m) return null;
                return (
                  <View key={s.platform} style={[styles.socialBadge, { backgroundColor: m.color + "15" }]}>
                    <Ionicons name={m.icon as any} size={12} color={m.color} />
                    <Text style={[styles.socialBadgeText, { color: m.color }]}>{s.handle}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Solana address indicator */}
          {isSolana && ensProfile.solanaAddress && (
            <View style={styles.solBadge}>
              <Text style={styles.solBadgeIcon}>☀️</Text>
              <Text style={styles.solBadgeText}>
                SOL: {ensProfile.solanaAddress.slice(0, 6)}…{ensProfile.solanaAddress.slice(-4)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Simple resolved address display (non-ENS or before profile loads) */}
      {showResolved && !showProfileCard && effectiveResolved && (
        <View style={styles.statusRow}>
          {!isSolana && detectedChainId !== null && (
            <ChainBadgeMini chainId={detectedChainId} size="small" showName />
          )}
          <Ionicons name="checkmark-circle" size={14} color="#10B981" />
          <Text style={styles.resolvedText}>
            {effectiveResolved.slice(0, 10)}…{effectiveResolved.slice(-8)}
          </Text>
        </View>
      )}

      <Modal
        visible={showRecipientPicker}
        animationType="slide"
        onRequestClose={closeRecipientPicker}
      >
        <View style={[styles.pickerScreen, { backgroundColor: pickerBg }]}>
          <View style={[styles.pickerHeader, { backgroundColor: pickerHeaderBg, borderBottomColor: pickerBorder }]}>
            <TouchableOpacity onPress={closeRecipientPicker} style={styles.pickerHeaderButton}>
              <Ionicons name="chevron-back" size={22} color={pickerText} />
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: pickerText }]}>Choose Recipient</Text>
            <TouchableOpacity
              onPress={() => commitRecipientValue(pickerInput.trim())}
              style={styles.pickerHeaderButton}
              disabled={!pickerInput.trim()}
            >
              <Text style={[styles.pickerUseText, { color: accentColor }, !pickerInput.trim() && styles.pickerUseTextDisabled]}>Use</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.pickerBody}>
            <View style={[styles.searchField, { backgroundColor: chipBg, borderColor: pickerBorder }]}>
              <Ionicons name="search" size={18} color={pickerSubtle} />
              <TextInput
                value={pickerInput}
                onChangeText={setPickerInput}
                placeholder={isSolana ? "SOL address or name.eth" : "Address or ENS name"}
                placeholderTextColor={pickerMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.searchInput, { color: pickerText }]}
              />
              {pickerInput.length > 0 && (
                <TouchableOpacity onPress={() => setPickerInput("")}>
                  <Ionicons name="close-circle" size={18} color={pickerSubtle} />
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.sectionTitle, { color: pickerMuted }]}>Other compatible accounts</Text>
            {compatibleAccounts.length === 0 ? (
              <Text style={[styles.emptyLine, { color: pickerSubtle }]}>No other compatible accounts found</Text>
            ) : (
              <FlatList
                data={compatibleAccounts}
                horizontal
                keyExtractor={(item) => item.address}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.accountsRow}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.accountChip, { backgroundColor: chipBg, borderColor: pickerBorder }]}
                    onPress={() => commitRecipientValue(item.address)}
                  >
                    <View style={[styles.accountChipAvatar, { backgroundColor: tintedSurface(accentColor, 0.16, isLight ? "#FFFFFF" : "#111111", scheme) }]}>
                      <Text style={[styles.accountChipAvatarText, { color: accentColor }]}>
                        {initialsFromName(item.name)}
                      </Text>
                    </View>
                    <View style={styles.accountChipInfo}>
                      <Text style={[styles.accountChipName, { color: pickerText }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.accountChipAddress, { color: pickerMuted }]} numberOfLines={1}>
                        {item.address.slice(0, 10)}…{item.address.slice(-8)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}

            <Text style={[styles.sectionTitle, { color: pickerMuted }]}>Contacts</Text>
            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.contactsList}
              ListEmptyComponent={
                <Text style={[styles.emptyLine, { color: pickerSubtle }]}>No contacts to show</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.contactRow, { backgroundColor: chipBg, borderColor: pickerBorder }]}
                  onPress={() => commitRecipientValue(item.ensName ?? item.address)}
                >
                  {item.ensName ? (
                    <ContactAvatar ensName={item.ensName} name={item.name} />
                  ) : (
                    <View style={[styles.contactAvatar, { backgroundColor: tintedSurface(accentColor, 0.16, isLight ? "#FFFFFF" : "#111111", scheme) }]}>
                      <Text style={[styles.contactAvatarText, { color: accentColor }]}>
                        {item.name.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.contactBody}>
                    <Text style={[styles.contactName, { color: pickerText }]}>{item.name}</Text>
                    <Text style={[styles.contactSub, { color: pickerMuted }]} numberOfLines={1}>
                      {item.ensName ?? `${item.address.slice(0, 10)}…${item.address.slice(-8)}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={pickerSubtle} />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  pillContainer: {
    marginBottom: 10,
  },
  pillLabel: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  recipientPill: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1E2E29",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recipientPillLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  recipientPillAvatarImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  recipientPillAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2D3D38",
    alignItems: "center",
    justifyContent: "center",
  },
  recipientPillAvatarInitials: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  recipientPillTextWrap: {
    flex: 1,
  },
  recipientPillText: {
    color: "#FFFFFF",
    fontSize: 15,
    flexShrink: 1,
  },
  recipientPillSubText: {
    color: "#9CA3AF",
    fontSize: 11,
    marginTop: 1,
  },
  recipientPillPlaceholder: {
    color: "#9CA3AF",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -10,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  resolvingText: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  resolvedText: {
    color: "#10B981",
    fontSize: 13,
    fontFamily: "monospace",
  },
  profileCard: {
    backgroundColor: "#1A2820",
    borderRadius: 14,
    marginTop: -8,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2D3D38",
  },
  profileCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  profileAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#569F8C20",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  profileDesc: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 1,
  },
  profileAddress: {
    color: "#569F8C",
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },
  profileSocials: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  socialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  socialBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  solBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  solBadgeIcon: {
    fontSize: 14,
  },
  solBadgeText: {
    color: "#F59E0B",
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "500",
  },
  pickerScreen: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  pickerHeader: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  pickerHeaderButton: {
    minWidth: 56,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  pickerUseText: {
    color: "#569F8C",
    fontSize: 15,
    fontWeight: "700",
  },
  pickerUseTextDisabled: {
    color: "#4B5563",
  },
  pickerBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  searchField: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1A2820",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 12,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 18,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  accountsRow: {
    paddingBottom: 4,
    gap: 10,
  },
  accountChip: {
    width: 190,
    backgroundColor: "#1A2820",
    borderWidth: 1,
    borderColor: "#2D3D38",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  accountChipAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#2D3D38",
    alignItems: "center",
    justifyContent: "center",
  },
  accountChipAvatarText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  accountChipInfo: {
    flex: 1,
  },
  accountChipName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  accountChipAddress: {
    color: "#9CA3AF",
    fontSize: 11,
    marginTop: 2,
    fontFamily: "monospace",
  },
  contactsList: {
    paddingBottom: 30,
  },
  contactRow: {
    backgroundColor: "#1A2820",
    borderWidth: 1,
    borderColor: "#2D3D38",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contactBody: {
    flex: 1,
  },
  contactAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#2D3D38",
    alignItems: "center",
    justifyContent: "center",
  },
  contactAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  contactAvatarText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  contactName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  contactSub: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
    fontFamily: "monospace",
  },
  emptyLine: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 8,
  },
});

function ContactAvatar({
  ensName,
  name,
}: {
  ensName: string;
  name: string;
}) {
  const [avatar, setAvatar] = useState<string | null>(null);
  const fallback = initialsFromName(name);

  useEffect(() => {
    let cancelled = false;
    ENSService.getProfile(ensName).then((profile) => {
      if (!cancelled) setAvatar(profile?.avatar ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [ensName]);

  if (avatar) {
    return <Image source={{ uri: avatar }} style={styles.contactAvatarImage} />;
  }

  return (
    <View style={styles.contactAvatar}>
      <Text style={styles.contactAvatarText}>{fallback}</Text>
    </View>
  );
}

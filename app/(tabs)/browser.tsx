/**
 * DApp Browser Tab
 * Main browser interface for interacting with decentralized applications
 */

import { EthersClient } from "@/app/profiles/client";
import {
  handleProviderRequest,
  PendingApproval,
  rejectApproval,
  resolveApproval,
  sendTransaction,
  setApprovalCallback,
  signMessage,
  signTypedData,
} from "@/services/browser-provider";
import { BROWSER_INJECTION_SCRIPT } from "@/services/browser-scripts";
import {
  DAppSession,
  getDappHost,
  normalizeUrl,
  useBrowserStore,
  ZAP_WALLET_USER_AGENT,
} from "@/store/browser";
import { useSelectedAccount, useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView, { WebViewMessageEvent } from "react-native-webview";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TAB_CARD_WIDTH = (SCREEN_WIDTH - 48) / 2; // 2 columns with padding
const TAB_CARD_HEIGHT = TAB_CARD_WIDTH * 1.4;

// Popular DApps for homepage
const POPULAR_DAPPS = [
  { name: "Pendle", url: "https://app.pendle.finance", icon: "⚡" },
  { name: "Ethena", url: "https://app.ethena.fi", icon: "💎" },
  { name: "ether.fi", url: "https://www.ether.fi", icon: "🔷" },
  { name: "Curve", url: "https://curve.fi", icon: "📈" },
  { name: "Balancer", url: "https://app.balancer.fi", icon: "⚖️" },
  { name: "Euler", url: "https://app.euler.finance", icon: "🏦" },
  { name: "Fluid", url: "https://fluid.instadapp.io", icon: "💧" },
  { name: "Stargate", url: "https://stargate.finance", icon: "🌉" },
];

export default function BrowserScreen() {
  const webViewRef = useRef<WebView>(null);
  const webViewRefs = useRef<Record<string, WebView | null>>({});
  const inputRef = useRef<TextInput>(null);

  // Store
  const selectedAccount = useSelectedAccount();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);

  const {
    currentUrl,
    setCurrentUrl,
    canGoBack,
    canGoForward,
    setNavState,
    addToHistory,
    addSession,
    getSession,
    history,
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    // Tab management
    activeTabId,
    tabs,
    tabOrder,
    createTab,
    closeTab,
    setActiveTab,
    updateTab,
  } = useBrowserStore();

  // Local state
  const [inputUrl, setInputUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHomepage, setShowHomepage] = useState(true);
  const [pageTitle, setPageTitle] = useState("");
  const [pageIcon, setPageIcon] = useState<string | null>(null);
  const [showTabSwitcher, setShowTabSwitcher] = useState(false);

  // Approval modal state
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Get tab count
  const tabCount = tabOrder.length;
  const activeTab = activeTabId ? tabs[activeTabId] : null;

  // Initialize first tab if none exist
  useEffect(() => {
    if (tabOrder.length === 0) {
      createTab("about:home");
    }
  }, [tabOrder.length, createTab]);

  // Set up approval callback
  useEffect(() => {
    setApprovalCallback((approval) => {
      setPendingApproval(approval);
      setShowApprovalModal(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    });

    return () => {
      setApprovalCallback(null);
    };
  }, []);

  // Handle system back gesture/button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        // If tab switcher is open, close it
        if (showTabSwitcher) {
          setShowTabSwitcher(false);
          return true;
        }
        // If menu is open, close it
        if (showMenu) {
          setShowMenu(false);
          return true;
        }
        // If we can go back in the browser, do that
        if (!showHomepage && canGoBack && webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        // If we're in the browser but can't go back, go to homepage
        if (!showHomepage) {
          handleHome();
          return true;
        }
        // Otherwise, let the system handle it
        return false;
      },
    );

    return () => backHandler.remove();
  }, [showHomepage, canGoBack, showMenu, showTabSwitcher]);

  // Navigate to URL
  const navigateTo = useCallback(
    (url: string) => {
      const normalizedUrl = normalizeUrl(url);
      setCurrentUrl(normalizedUrl);
      setShowHomepage(false);
      setInputUrl(normalizedUrl);
      // Update active tab URL
      if (activeTabId) {
        updateTab(activeTabId, { url: normalizedUrl });
      }
      Keyboard.dismiss();
    },
    [setCurrentUrl, activeTabId, updateTab],
  );

  // Handle address bar submit
  const handleSubmit = useCallback(() => {
    if (inputUrl.trim()) {
      navigateTo(inputUrl.trim());
    }
  }, [inputUrl, navigateTo]);

  // Navigation controls
  const handleGoBack = useCallback(() => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    }
  }, [canGoBack]);

  const handleGoForward = useCallback(() => {
    if (canGoForward && webViewRef.current) {
      webViewRef.current.goForward();
    }
  }, [canGoForward]);

  const handleRefresh = useCallback(() => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  }, []);

  const handleHome = useCallback(() => {
    setShowHomepage(true);
    setCurrentUrl("about:home");
    setInputUrl("");
    setPageTitle("");
    setPageIcon(null);
    if (activeTabId) {
      updateTab(activeTabId, { url: "about:home", title: "Home" });
    }
  }, [setCurrentUrl, activeTabId, updateTab]);

  // Tab management handlers
  const handleNewTab = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createTab("about:home");
    setShowHomepage(true);
    setInputUrl("");
    setPageTitle("");
    setShowTabSwitcher(false);
  }, [createTab]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      closeTab(tabId);
      // If we closed all tabs, create a new one
      if (tabOrder.length <= 1) {
        createTab("about:home");
        setShowHomepage(true);
      }
    },
    [closeTab, tabOrder.length, createTab],
  );

  const handleSwitchTab = useCallback(
    (tabId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveTab(tabId);
      const tab = tabs[tabId];
      if (tab) {
        if (tab.url === "about:home") {
          setShowHomepage(true);
          setInputUrl("");
        } else {
          setShowHomepage(false);
          setCurrentUrl(tab.url);
          setInputUrl(tab.url);
          setPageTitle(tab.title || "");
        }
      }
      setShowTabSwitcher(false);
    },
    [setActiveTab, tabs, setCurrentUrl],
  );

  // Handle WebView messages
  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === "provider_request") {
          // Handle provider request
          const response = await handleProviderRequest({
            id: data.id,
            method: data.method,
            params: data.params || [],
            origin: data.origin,
            host: data.host,
            title: data.title,
          });

          // Send response back to WebView
          webViewRef.current?.injectJavaScript(`
          window.postMessage(${JSON.stringify({
            type: "provider_response",
            id: response.id,
            result: response.result,
            error: response.error,
          })});
          true;
        `);
        } else if (data.type === "metadata") {
          // Update page metadata
          if (data.title) {
            setPageTitle(data.title);
          }
          if (data.icon) {
            setPageIcon(data.icon);
          }
          if (data.url && data.title) {
            addToHistory({ url: data.url, title: data.title, icon: data.icon });
          }
        }
      } catch (error) {
        console.error("[Browser] Error handling message:", error);
      }
    },
    [addToHistory],
  );

  // Handle navigation state changes
  const handleNavigationStateChange = useCallback(
    (navState: any) => {
      setNavState(navState.canGoBack, navState.canGoForward);
      if (navState.url && navState.url !== currentUrl) {
        setCurrentUrl(navState.url);
        setInputUrl(navState.url);
      }
      if (navState.title) {
        setPageTitle(navState.title);
      }
      // Update active tab with navigation state
      if (activeTabId) {
        updateTab(activeTabId, {
          url: navState.url,
          title: navState.title,
          canGoBack: navState.canGoBack,
          canGoForward: navState.canGoForward,
        });
      }
    },
    [currentUrl, setCurrentUrl, setNavState, activeTabId, updateTab],
  );

  // Handle approval
  const handleApprove = useCallback(async () => {
    if (!pendingApproval || !selectedAccount) return;

    setIsProcessing(true);

    try {
      const { type, request } = pendingApproval;
      const host = getDappHost(request.origin);
      let result: unknown;

      switch (type) {
        case "connect": {
          // Create session
          const session: DAppSession = {
            host,
            url: request.origin,
            name: request.title,
            address: selectedAccount.address,
            chainId: selectedChainId,
            connectedAt: Date.now(),
          };
          addSession(session);

          // Emit connect event to WebView
          const chainIdHex = "0x" + selectedChainId.toString(16);
          const connectMsg = JSON.stringify({
            type: "connect",
            chainId: chainIdHex,
          });
          const accountsMsg = JSON.stringify({
            type: "accountsChanged",
            accounts: [selectedAccount.address],
          });
          webViewRef.current?.injectJavaScript(`
            window.postMessage(${connectMsg}); 
            window.postMessage(${accountsMsg});
            true;
          `);

          result = [selectedAccount.address];
          break;
        }

        case "sign_message": {
          const message = request.params[0] as string;
          const signature = await signMessage(
            selectedAccount.address,
            message,
            selectedChainId,
          );
          result = signature;
          break;
        }

        case "sign_typed_data": {
          // params[0] is address, params[1] is data
          const typedData = request.params[1];
          const signature = await signTypedData(
            selectedAccount.address,
            typedData,
            selectedChainId,
          );
          result = signature;
          break;
        }

        case "sign_transaction": {
          const txParams = request.params[0];
          const txHash = await sendTransaction(
            selectedAccount.address,
            txParams,
            selectedChainId,
          );
          result = txHash;
          break;
        }

        default:
          result = null;
      }

      resolveApproval(pendingApproval.id, result);
      setShowApprovalModal(false);
      setPendingApproval(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error("[Browser] Approval error:", error);
      Alert.alert("Error", error.message || "Failed to process request");
    } finally {
      setIsProcessing(false);
    }
  }, [pendingApproval, selectedAccount, selectedChainId, addSession]);

  // Handle rejection
  const handleReject = useCallback(() => {
    if (pendingApproval) {
      rejectApproval(pendingApproval.id);
      setShowApprovalModal(false);
      setPendingApproval(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [pendingApproval]);

  // Toggle favorite
  const toggleFavorite = useCallback(() => {
    if (currentUrl && currentUrl !== "about:home") {
      if (isFavorite(currentUrl)) {
        removeFavorite(currentUrl);
      } else {
        addFavorite({
          url: currentUrl,
          name: pageTitle || getDappHost(currentUrl),
          icon: pageIcon || undefined,
        });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [
    currentUrl,
    pageTitle,
    pageIcon,
    isFavorite,
    addFavorite,
    removeFavorite,
  ]);

  // Render tab card for tab switcher
  const renderTabCard = useCallback(
    ({ item: tabId }: { item: string }) => {
      const tab = tabs[tabId];
      if (!tab) return null;

      const isActive = tabId === activeTabId;
      const displayUrl = tab.url === "about:home" ? "" : getDappHost(tab.url);
      const displayTitle =
        tab.title || (tab.url === "about:home" ? "New Tab" : displayUrl);

      return (
        <TouchableOpacity
          style={[styles.tabCard, isActive && styles.tabCardActive]}
          onPress={() => handleSwitchTab(tabId)}
          activeOpacity={0.7}
        >
          <View style={styles.tabCardHeader}>
            <Text style={styles.tabCardTitle} numberOfLines={1}>
              {displayTitle}
            </Text>
            <TouchableOpacity
              style={styles.tabCloseButton}
              onPress={(e) => {
                e.stopPropagation();
                handleCloseTab(tabId);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <View style={styles.tabCardContent}>
            {tab.url === "about:home" ? (
              <View style={styles.tabCardHomePlaceholder}>
                <Text style={styles.tabCardHomeIcon}>⚡</Text>
              </View>
            ) : (
              <View style={styles.tabCardPreview}>
                <Ionicons name="globe-outline" size={32} color="#4B5563" />
                <Text style={styles.tabCardUrl} numberOfLines={1}>
                  {displayUrl}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [tabs, activeTabId, handleSwitchTab, handleCloseTab],
  );

  // Render tab switcher (Chrome-like grid)
  const renderTabSwitcher = () => (
    <View style={styles.tabSwitcher}>
      <View style={styles.tabSwitcherHeader}>
        <Text style={styles.tabSwitcherTitle}>
          {tabCount} {tabCount === 1 ? "Tab" : "Tabs"}
        </Text>
        <TouchableOpacity
          style={styles.tabSwitcherCloseButton}
          onPress={() => setShowTabSwitcher(false)}
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={tabOrder}
        renderItem={renderTabCard}
        keyExtractor={(item) => item}
        numColumns={2}
        contentContainerStyle={styles.tabGrid}
        columnWrapperStyle={styles.tabGridRow}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity style={styles.newTabButton} onPress={handleNewTab}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
        <Text style={styles.newTabButtonText}>New Tab</Text>
      </TouchableOpacity>
    </View>
  );

  // Render homepage
  const renderHomepage = () => (
    <ScrollView
      style={styles.homepage}
      contentContainerStyle={styles.homepageContent}
    >
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>⚡</Text>
        <Text style={styles.logoText}>Zap Browser</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color="#6B7280"
          style={styles.searchIcon}
        />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={handleSubmit}
          placeholder="Search or enter URL"
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
        />
      </View>

      <Text style={styles.sectionTitle}>Popular DApps</Text>
      <View style={styles.dappsGrid}>
        {POPULAR_DAPPS.map((dapp, index) => (
          <TouchableOpacity
            key={index}
            style={styles.dappCard}
            onPress={() => navigateTo(dapp.url)}
          >
            <Text style={styles.dappIcon}>{dapp.icon}</Text>
            <Text style={styles.dappName}>{dapp.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {favorites.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Favorites</Text>
          <View style={styles.dappsGrid}>
            {favorites.slice(0, 8).map((fav, index) => (
              <TouchableOpacity
                key={index}
                style={styles.dappCard}
                onPress={() => navigateTo(fav.url)}
              >
                <Text style={styles.dappIcon}>⭐</Text>
                <Text style={styles.dappName} numberOfLines={1}>
                  {fav.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {history.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent</Text>
          {history.slice(0, 5).map((entry, index) => (
            <TouchableOpacity
              key={index}
              style={styles.historyItem}
              onPress={() => navigateTo(entry.url)}
            >
              <Text style={styles.historyTitle} numberOfLines={1}>
                {entry.title || entry.url}
              </Text>
              <Text style={styles.historyUrl} numberOfLines={1}>
                {getDappHost(entry.url)}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Tab switcher button on homepage */}
      <TouchableOpacity
        style={styles.homepageTabButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowTabSwitcher(true);
        }}
      >
        <View style={styles.tabCountBadgeLarge}>
          <Text style={styles.tabCountTextLarge}>{tabCount}</Text>
        </View>
        <Text style={styles.homepageTabButtonText}>View All Tabs</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // Render approval content
  const renderApprovalContent = () => {
    if (!pendingApproval) return null;

    const { type, request } = pendingApproval;
    const host = getDappHost(request.origin);

    switch (type) {
      case "connect":
        return (
          <>
            <Text style={styles.approvalTitle}>Connection Request</Text>
            <Text style={styles.approvalHost}>{host}</Text>
            <Text style={styles.approvalDescription}>
              This site wants to connect to your wallet
            </Text>
            <View style={styles.approvalDetail}>
              <Text style={styles.approvalLabel}>Account</Text>
              <Text style={styles.approvalValue} numberOfLines={1}>
                {selectedAccount?.address}
              </Text>
            </View>
            <View style={styles.approvalDetail}>
              <Text style={styles.approvalLabel}>Network</Text>
              <Text style={styles.approvalValue}>
                {networkConfig?.name || `Chain ${selectedChainId}`}
              </Text>
            </View>
          </>
        );

      case "sign_message":
        return (
          <>
            <Text style={styles.approvalTitle}>Sign Message</Text>
            <Text style={styles.approvalHost}>{host}</Text>
            <Text style={styles.approvalDescription}>
              This site wants you to sign a message
            </Text>
            <View style={styles.messageBox}>
              <Text style={styles.messageText} numberOfLines={10}>
                {request.params[0] as string}
              </Text>
            </View>
          </>
        );

      case "sign_typed_data":
        return (
          <>
            <Text style={styles.approvalTitle}>Sign Typed Data</Text>
            <Text style={styles.approvalHost}>{host}</Text>
            <Text style={styles.approvalDescription}>
              This site wants you to sign typed data
            </Text>
            <View style={styles.messageBox}>
              <Text style={styles.messageText} numberOfLines={10}>
                {JSON.stringify(request.params[1], null, 2)}
              </Text>
            </View>
          </>
        );

      case "sign_transaction":
        const tx = request.params[0] as any;
        return (
          <>
            <Text style={styles.approvalTitle}>Confirm Transaction</Text>
            <Text style={styles.approvalHost}>{host}</Text>
            <View style={styles.approvalDetail}>
              <Text style={styles.approvalLabel}>To</Text>
              <Text style={styles.approvalValue} numberOfLines={1}>
                {tx.to}
              </Text>
            </View>
            {tx.value && tx.value !== "0x0" && (
              <View style={styles.approvalDetail}>
                <Text style={styles.approvalLabel}>Value</Text>
                <Text style={styles.approvalValue}>
                  {parseInt(tx.value, 16) / 1e18}{" "}
                  {networkConfig?.nativeCurrency.symbol}
                </Text>
              </View>
            )}
            {tx.data && tx.data !== "0x" && (
              <View style={styles.approvalDetail}>
                <Text style={styles.approvalLabel}>Data</Text>
                <Text style={styles.approvalValue} numberOfLines={2}>
                  {tx.data}
                </Text>
              </View>
            )}
          </>
        );

      default:
        return (
          <>
            <Text style={styles.approvalTitle}>Unknown Request</Text>
            <Text style={styles.approvalDescription}>{type}</Text>
          </>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Tab Switcher */}
      {showTabSwitcher && renderTabSwitcher()}

      {/* Address Bar */}
      {!showHomepage && !showTabSwitcher && (
        <View style={styles.addressBar}>
          <TouchableOpacity onPress={handleHome} style={styles.navButton}>
            <Ionicons name="home-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.urlContainer}>
            {isLoading && (
              <ActivityIndicator
                size="small"
                color="#569F8C"
                style={styles.loadingIndicator}
              />
            )}
            <TextInput
              style={styles.urlInput}
              value={inputUrl}
              onChangeText={setInputUrl}
              onSubmitEditing={handleSubmit}
              placeholder="Search or enter URL"
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              selectTextOnFocus
            />
          </View>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowTabSwitcher(true);
            }}
            style={styles.tabCountButton}
          >
            <View style={styles.tabCountBadge}>
              <Text style={styles.tabCountText}>{tabCount}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleFavorite} style={styles.navButton}>
            <Ionicons
              name={isFavorite(currentUrl) ? "star" : "star-outline"}
              size={22}
              color={isFavorite(currentUrl) ? "#F59E0B" : "#FFFFFF"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowMenu(!showMenu);
            }}
            style={styles.navButton}
          >
            <Ionicons name="ellipsis-vertical" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Context Menu */}
      {showMenu && !showHomepage && !showTabSwitcher && (
        <View style={styles.contextMenu}>
          <TouchableOpacity
            style={[styles.menuItem, !canGoForward && styles.menuItemDisabled]}
            onPress={() => {
              handleGoForward();
              setShowMenu(false);
            }}
            disabled={!canGoForward}
          >
            <Ionicons
              name="arrow-forward"
              size={20}
              color={canGoForward ? "#FFFFFF" : "#4B5563"}
            />
            <Text
              style={[
                styles.menuItemText,
                !canGoForward && styles.menuItemTextDisabled,
              ]}
            >
              Forward
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              handleRefresh();
              setShowMenu(false);
            }}
          >
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.menuItemText}>Refresh</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              if (currentUrl && currentUrl !== "about:home") {
                // Copy URL to clipboard
                import("expo-clipboard").then((Clipboard) => {
                  Clipboard.setStringAsync(currentUrl);
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                });
              }
              setShowMenu(false);
            }}
          >
            <Ionicons name="copy-outline" size={20} color="#FFFFFF" />
            <Text style={styles.menuItemText}>Copy URL</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Menu Overlay to close menu when tapping outside */}
      {showMenu && !showTabSwitcher && (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        />
      )}

      {/* Content */}
      {!showTabSwitcher &&
        (showHomepage ? (
          renderHomepage()
        ) : (
          <WebView
            ref={webViewRef}
            source={{ uri: currentUrl }}
            style={styles.webview}
            injectedJavaScriptBeforeContentLoaded={BROWSER_INJECTION_SCRIPT}
            onMessage={handleMessage}
            onNavigationStateChange={handleNavigationStateChange}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            allowsBackForwardNavigationGestures
            userAgent={ZAP_WALLET_USER_AGENT}
            originWhitelist={["*"]}
            mixedContentMode="compatibility"
          />
        ))}

      {/* Approval Modal */}
      <Modal
        visible={showApprovalModal}
        transparent
        animationType="slide"
        onRequestClose={handleReject}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
            </View>

            <ScrollView style={styles.approvalScroll}>
              {renderApprovalContent()}
            </ScrollView>

            <View style={styles.approvalButtons}>
              <TouchableOpacity
                style={[styles.approvalButton, styles.rejectButton]}
                onPress={handleReject}
                disabled={isProcessing}
              >
                <Text style={styles.rejectButtonText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.approvalButton, styles.approveButton]}
                onPress={handleApprove}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.approveButtonText}>Approve</Text>
                )}
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
  addressBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: "#1A2421",
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  navButton: {
    padding: 8,
  },
  urlContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1512",
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  loadingIndicator: {
    marginRight: 8,
  },
  urlInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    paddingVertical: 10,
  },
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  contextMenu: {
    position: "absolute",
    top: 56,
    right: 12,
    backgroundColor: "#1A2421",
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 160,
    zIndex: 100,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuItemText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  menuItemTextDisabled: {
    color: "#4B5563",
  },
  menuOverlay: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99,
  },

  // Homepage styles
  homepage: {
    flex: 1,
  },
  homepageContent: {
    padding: 20,
  },
  logoContainer: {
    alignItems: "center",
    marginVertical: 32,
  },
  logo: {
    fontSize: 64,
  },
  logoText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A2421",
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 16,
    marginTop: 8,
  },
  dappsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  dappCard: {
    width: "22%",
    aspectRatio: 1,
    backgroundColor: "#1A2421",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  dappIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  dappName: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
  },
  historyItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  historyTitle: {
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  historyUrl: {
    fontSize: 12,
    color: "#6B7280",
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1A2421",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    alignItems: "center",
    paddingVertical: 12,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#4B5563",
    borderRadius: 2,
  },
  approvalScroll: {
    paddingHorizontal: 20,
    maxHeight: 400,
  },
  approvalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  approvalHost: {
    fontSize: 14,
    color: "#569F8C",
    textAlign: "center",
    marginBottom: 16,
  },
  approvalDescription: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 20,
  },
  approvalDetail: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#1E2E29",
  },
  approvalLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  approvalValue: {
    fontSize: 14,
    color: "#FFFFFF",
    flex: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  messageBox: {
    backgroundColor: "#0F1512",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  messageText: {
    fontSize: 13,
    color: "#D1D5DB",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  approvalButtons: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
  },
  approvalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButton: {
    backgroundColor: "#374151",
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  approveButton: {
    backgroundColor: "#569F8C",
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Tab switcher styles
  tabSwitcher: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  tabSwitcherHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  tabSwitcherTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  tabSwitcherCloseButton: {
    padding: 8,
  },
  tabGrid: {
    padding: 12,
    paddingBottom: 100,
  },
  tabGridRow: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  tabCard: {
    width: TAB_CARD_WIDTH,
    height: TAB_CARD_HEIGHT,
    backgroundColor: "#1A2421",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  tabCardActive: {
    borderColor: "#569F8C",
  },
  tabCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#243029",
  },
  tabCardTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#FFFFFF",
    marginRight: 8,
  },
  tabCloseButton: {
    padding: 4,
  },
  tabCardContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A2421",
  },
  tabCardHomePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabCardHomeIcon: {
    fontSize: 40,
  },
  tabCardPreview: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  tabCardUrl: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 8,
    textAlign: "center",
  },
  newTabButton: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#569F8C",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  newTabButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  tabCountButton: {
    padding: 8,
  },
  tabCountBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  tabCountBadgeLarge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#569F8C",
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountTextLarge: {
    fontSize: 14,
    fontWeight: "700",
    color: "#569F8C",
  },
  homepageTabButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 24,
    marginBottom: 32,
    paddingVertical: 16,
    backgroundColor: "#1A2421",
    borderRadius: 12,
  },
  homepageTabButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#9CA3AF",
  },
});

import { ChainId, EthersClient } from "@/app/profiles/client";
import { useFiatValue } from "@/hooks/use-fiat-value";
import { hexToRgba, tintedBackground, useAccentColor } from "@/store/appearance";
import { MerchantProduct, useMerchantStore } from "@/store/merchant";
import { useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
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

const EMOJIS = ["🛍️", "🍕", "☕", "🍺", "🎮", "💈", "🧁", "🎫", "📦", "🔧", "💇", "🎸", "🍜", "🧴", "📱"];

// ---------------------------------------------------------------------------
// Add / Edit product modal
// ---------------------------------------------------------------------------

interface ProductModalProps {
  visible: boolean;
  editing: MerchantProduct | null;
  symbol: string;
  onSave: (name: string, price: string, emoji: string) => void;
  onClose: () => void;
}

function ProductModal({ visible, editing, symbol, onSave, onClose }: ProductModalProps) {
  const accentColor = useAccentColor();
  const [name, setName] = useState(editing?.name ?? "");
  const [price, setPrice] = useState(editing?.price ?? "");
  const [emoji, setEmoji] = useState(editing?.emoji ?? EMOJIS[0]);

  // Reset fields when modal opens for a new product or different product
  React.useEffect(() => {
    if (visible) {
      setName(editing?.name ?? "");
      setPrice(editing?.price ?? "");
      setEmoji(editing?.emoji ?? EMOJIS[0]);
    }
  }, [visible, editing]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Missing name", "Enter a product name.");
      return;
    }
    const parsedPrice = parseFloat(price);
    if (!price.trim() || isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert("Invalid price", "Enter a price greater than 0.");
      return;
    }
    onSave(trimmedName, parsedPrice.toString(), emoji);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modal.overlay}>
        <KeyboardAvoidingView
          behavior="padding"
          style={{ width: "100%" }}
        >
          <View style={modal.sheet}>
            <View style={modal.handle} />

            <Text style={modal.title}>{editing ? "Edit Product" : "Add Product"}</Text>

            {/* Emoji picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={modal.emojiScroll}>
              {EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[modal.emojiBtn, emoji === e && modal.emojiBtnActive, emoji === e && { borderColor: accentColor, backgroundColor: hexToRgba(accentColor, 0.15) }]}
                  onPress={() => setEmoji(e)}
                >
                  <Text style={modal.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={modal.input}
              placeholder="Product name"
              placeholderTextColor="#4B5563"
              value={name}
              onChangeText={setName}
              autoFocus={!editing}
              returnKeyType="next"
            />

            <View style={modal.priceRow}>
              <Text style={modal.priceCurrency}>{symbol}</Text>
              <TextInput
                style={[modal.input, { flex: 1, marginBottom: 0 }]}
                placeholder="0.00"
                placeholderTextColor="#4B5563"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </View>

            <TouchableOpacity style={[modal.saveBtn, { backgroundColor: accentColor }]} onPress={handleSave}>
              <Text style={modal.saveBtnText}>{editing ? "Save Changes" : "Add Product"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={modal.cancelBtn} onPress={onClose}>
              <Text style={modal.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

interface ProductCardProps {
  product: MerchantProduct;
  quantity: number;
  symbol: string;
  chainId: ChainId;
  onAdd: () => void;
  onRemove: () => void;
  onLongPress: () => void;
}

function ProductCard({ product, quantity, symbol, chainId, onAdd, onRemove, onLongPress }: ProductCardProps) {
  const accentColor = useAccentColor();
  const fiat = useFiatValue(product.price, chainId);
  return (
    <TouchableOpacity
      style={[card.container, quantity > 0 && card.containerActive, quantity > 0 && { borderColor: accentColor }]}
      onPress={onAdd}
      onLongPress={onLongPress}
      delayLongPress={500}
      activeOpacity={0.75}
    >
      <Text style={card.emoji}>{product.emoji}</Text>
      <Text style={card.name} numberOfLines={2}>{product.name}</Text>
      <Text style={card.price}>{product.price} {symbol}</Text>
      {fiat && <Text style={card.fiat}>{fiat}</Text>}

      {quantity > 0 && (
        <View style={card.qtyRow}>
          <TouchableOpacity style={[card.qtyBtn, { backgroundColor: accentColor }]} onPress={onRemove}>
            <Ionicons name="remove" size={14} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={card.qtyText}>{quantity}</Text>
          <TouchableOpacity style={[card.qtyBtn, { backgroundColor: accentColor }]} onPress={onAdd}>
            <Ionicons name="add" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Merchant screen
// ---------------------------------------------------------------------------

export default function MerchantScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);
  const router = useRouter();
  const selectedChainId = useWalletStore((s) => s.selectedChainId);
  const networkConfig = EthersClient.getNetworkConfig(selectedChainId);
  const symbol = networkConfig?.nativeCurrency.symbol ?? "ETH";

  const products = useMerchantStore((s) => s.products);
  const basket = useMerchantStore((s) => s.basket);
  const addProduct = useMerchantStore((s) => s.addProduct);
  const editProduct = useMerchantStore((s) => s.editProduct);
  const removeProduct = useMerchantStore((s) => s.removeProduct);
  const addToBasket = useMerchantStore((s) => s.addToBasket);
  const removeFromBasket = useMerchantStore((s) => s.removeFromBasket);
  const clearBasket = useMerchantStore((s) => s.clearBasket);
  const getBasketTotal = useMerchantStore((s) => s.getBasketTotal);
  const getBasketCount = useMerchantStore((s) => s.getBasketCount);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MerchantProduct | null>(null);
  const [basketOpen, setBasketOpen] = useState(false);

  const basketCount = getBasketCount();
  const basketTotal = getBasketTotal();
  const basketFiat = useFiatValue(basketTotal, selectedChainId);
  const accentSurface = hexToRgba(accentColor, 0.14);
  const accentBorder = hexToRgba(accentColor, 0.3);

  const handleAdd = (productId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addToBasket(productId);
  };

  const handleRemove = (productId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeFromBasket(productId);
  };

  const handleLongPress = (product: MerchantProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(product.name, "What would you like to do?", [
      {
        text: "Edit",
        onPress: () => {
          setEditingProduct(product);
          setModalVisible(true);
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Alert.alert("Delete Product", `Remove "${product.name}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => removeProduct(product.id) },
          ]);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleSaveProduct = (name: string, price: string, emoji: string) => {
    if (editingProduct) {
      editProduct(editingProduct.id, { name, price, emoji });
    } else {
      addProduct({ name, price, emoji });
    }
    setModalVisible(false);
    setEditingProduct(null);
  };

  const handleRequestPayment = () => {
    if (basketCount === 0) return;
    setBasketOpen(false);
    router.push("/merchant/checkout" as any);
  };

  const getQuantity = (productId: string) =>
    basket.find((b) => b.productId === productId)?.quantity ?? 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Merchant</Text>
          <Text style={styles.headerSub}>Receiving in {symbol}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: accentColor }]}
          onPress={() => { setEditingProduct(null); setModalVisible(true); }}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Product grid */}
      {products.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🛍️</Text>
          <Text style={styles.emptyTitle}>No products yet</Text>
          <Text style={styles.emptySub}>Tap + to add your first product</Text>
          <TouchableOpacity
            style={[styles.emptyAddBtn, { backgroundColor: accentSurface, borderColor: accentBorder, borderWidth: 1 }]}
            onPress={() => { setEditingProduct(null); setModalVisible(true); }}
          >
            <Ionicons name="add-circle-outline" size={18} color={accentColor} />
            <Text style={[styles.emptyAddBtnText, { color: accentColor }]}>Add Product</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              quantity={getQuantity(item.id)}
              symbol={symbol}
              chainId={selectedChainId}
              onAdd={() => handleAdd(item.id)}
              onRemove={() => handleRemove(item.id)}
              onLongPress={() => handleLongPress(item)}
            />
          )}
        />
      )}

      {/* Basket bar */}
      {basketCount > 0 && (
        <View style={[styles.basketBar, { backgroundColor: accentSurface, borderTopColor: accentBorder }]}>
          <TouchableOpacity style={styles.basketBarInner} onPress={() => setBasketOpen(true)}>
            <View style={styles.basketLeft}>
              <View style={[styles.basketBadge, { backgroundColor: accentColor }]}>
                <Text style={styles.basketBadgeText}>{basketCount}</Text>
              </View>
              <Text style={styles.basketLabel}>View basket</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.basketTotal, { color: accentColor }]}>{basketTotal} {symbol}</Text>
              {basketFiat && <Text style={styles.basketFiat}>{basketFiat}</Text>}
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Basket sheet */}
      <Modal visible={basketOpen} transparent animationType="slide" onRequestClose={() => setBasketOpen(false)}>
        <View style={sheet.overlay}>
          <View style={sheet.container}>
            <View style={sheet.handle} />
            <View style={sheet.headerRow}>
              <Text style={sheet.title}>Basket</Text>
              <TouchableOpacity onPress={() => { clearBasket(); setBasketOpen(false); }}>
                <Text style={sheet.clearText}>Clear</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={sheet.list}>
              {basket.map((item) => {
                const product = products.find((p) => p.id === item.productId);
                if (!product) return null;
                const lineTotal = parseFloat((parseFloat(product.price) * item.quantity).toFixed(8)).toString();
                return (
                  <View key={item.productId} style={sheet.row}>
                    <Text style={sheet.rowEmoji}>{product.emoji}</Text>
                    <View style={sheet.rowInfo}>
                      <Text style={sheet.rowName}>{product.name}</Text>
                      <Text style={sheet.rowPrice}>{product.price} {symbol} × {item.quantity}</Text>
                    </View>
                    <View style={sheet.rowQty}>
                      <TouchableOpacity onPress={() => handleRemove(item.productId)}>
                        <Ionicons name="remove-circle-outline" size={22} color="#6B7280" />
                      </TouchableOpacity>
                      <Text style={[sheet.rowLineTotal, { color: accentColor }]}>{lineTotal}</Text>
                      <TouchableOpacity onPress={() => handleAdd(item.productId)}>
                        <Ionicons name="add-circle-outline" size={22} color={accentColor} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={sheet.footer}>
              <View style={sheet.totalRow}>
                <Text style={sheet.totalLabel}>Total</Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={sheet.totalAmount}>{basketTotal} {symbol}</Text>
                  {basketFiat && <Text style={sheet.totalFiat}>{basketFiat}</Text>}
                </View>
              </View>
              <TouchableOpacity style={[sheet.payBtn, { backgroundColor: accentColor }]} onPress={handleRequestPayment}>
                <Ionicons name="radio" size={20} color="#FFFFFF" />
                <Text style={sheet.payBtnText}>Request Payment via NFC</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add/Edit product modal */}
      <ProductModal
        visible={modalVisible}
        editing={editingProduct}
        symbol={symbol}
        onSave={handleSaveProduct}
        onClose={() => { setModalVisible(false); setEditingProduct(null); }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1512" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  headerTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "700" },
  headerSub: { color: "#6B7280", fontSize: 13, marginTop: 2 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { padding: 12, paddingBottom: 120 },
  gridRow: { gap: 12 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 40,
  },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  emptySub: { color: "#6B7280", fontSize: 15, textAlign: "center" },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
  },
  emptyAddBtnText: { color: "#10B981", fontSize: 15, fontWeight: "600" },
  basketBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1E2E29",
    borderTopWidth: 1,
    borderTopColor: "#2D4038",
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
  },
  basketBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  basketLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  basketBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  basketBadgeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  basketLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  basketTotal: { color: "#10B981", fontSize: 16, fontWeight: "700" },
  basketFiat: { color: "#6B7280", fontSize: 12, marginTop: 1 },
});

const card = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1E2E29",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 6,
    borderWidth: 2,
    borderColor: "transparent",
    minHeight: 130,
  },
  containerActive: { borderColor: "#10B981" },
  emoji: { fontSize: 32 },
  name: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", flex: 1 },
  price: { color: "#9CA3AF", fontSize: 13 },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    backgroundColor: "#0F1512",
    borderRadius: 10,
    padding: 4,
    alignSelf: "flex-start",
  },
  qtyBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#569F8C",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", minWidth: 16, textAlign: "center" },
  fiat: { color: "#6B7280", fontSize: 12 },
});

const sheet = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  container: {
    backgroundColor: "#0F1512",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: "80%",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  clearText: { color: "#EF4444", fontSize: 14, fontWeight: "500" },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
    gap: 12,
  },
  rowEmoji: { fontSize: 28 },
  rowInfo: { flex: 1 },
  rowName: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  rowPrice: { color: "#6B7280", fontSize: 13, marginTop: 2 },
  rowQty: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLineTotal: { color: "#10B981", fontSize: 14, fontWeight: "600", minWidth: 60, textAlign: "center" },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#1E2E29",
    gap: 16,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { color: "#9CA3AF", fontSize: 16 },
  totalAmount: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  payBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  totalFiat: { color: "#9CA3AF", fontSize: 13, marginTop: 2 },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0F1512",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
    gap: 12,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#374151",
    alignSelf: "center",
    marginBottom: 8,
  },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginBottom: 4 },
  emojiScroll: { flexGrow: 0, marginBottom: 4 },
  emojiBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "#1E2E29",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  emojiBtnActive: { backgroundColor: "#2D4038", borderWidth: 2, borderColor: "#10B981" },
  emojiText: { fontSize: 22 },
  input: {
    backgroundColor: "#1E2E29",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#2D4038",
    marginBottom: 0,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  priceCurrency: { color: "#9CA3AF", fontSize: 16, fontWeight: "600", minWidth: 36 },
  saveBtn: {
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  cancelBtn: { paddingVertical: 12, alignItems: "center", marginBottom: 8 },
  cancelBtnText: { color: "#6B7280", fontSize: 15 },
});

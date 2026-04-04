import { formatBigInt } from "@/libs/bigInt";
import { SquareArrowUpRightIcon } from "lucide-react-native";
import { Linking, Text, TouchableOpacity, View, ViewStyle } from "react-native";

export const TransactionOverview = ({
  activeTransaction,
  symbol,
  decimals,
  txHash,
  explorerPrefix,
}: {
  activeTransaction:
    | readonly [
        bigint,
        bigint,
        `0x${string}`,
        boolean,
        bigint,
        string,
        boolean,
        string,
        string,
        string,
        `0x${string}`,
      ]
    | any;
  symbol: string;
  decimals: number;
  txHash?: `0x${string}` | string;
  explorerPrefix?: string;
}) => {
  const rowStyle: ViewStyle = {
    justifyContent: "space-between",
    flexDirection: "row",
  };

  let items: {
    name: string;
    quantity: string;
    value: string;
  }[] = [];

  try {
    items = JSON.parse(activeTransaction[9]) as {
      name: string;
      quantity: string;
      value: string;
    }[];
  } catch (e) {}

  return (
    <>
      <View
        style={{
          padding: 16,
          borderColor: "rgba(0,0,0,0.1)",
          borderWidth: 1,
          width: "100%",
          borderRadius: 16,
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "600" }}>
          Transaction #{activeTransaction[0]?.toString()}
        </Text>
        <View style={rowStyle}>
          <Text>Amount</Text>
          <Text style={{ fontWeight: "bold" }}>
            {symbol} {formatBigInt(activeTransaction[1], decimals)}
          </Text>
        </View>

        <View style={rowStyle}>
          <Text>Description</Text>
          <Text style={{ fontWeight: "bold" }}>{activeTransaction[5]}</Text>
        </View>

        <View style={rowStyle}>
          <Text>Merchant</Text>
          <Text style={{ fontWeight: "bold" }}>{activeTransaction[7]}</Text>
        </View>

        <View style={rowStyle}>
          <Text>Location</Text>
          <Text style={{ fontWeight: "bold" }}>{activeTransaction[8]}</Text>
        </View>

        {txHash && (
          <View style={rowStyle}>
            <Text>Tx Hash</Text>
            <TouchableOpacity
              onPress={() => {
                Linking.openURL(`${explorerPrefix}${txHash}`).catch((err) =>
                  console.error("Couldn't load page", err),
                );
              }}
              style={{ flexDirection: "row", gap: 4 }}
            >
              <Text style={{ fontWeight: "bold" }} ellipsizeMode={"middle"}>
                {txHash?.slice(0, 10) ?? "Pending"}
              </Text>
              <SquareArrowUpRightIcon size={16} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View
        style={{
          padding: 16,
          borderColor: "rgba(0,0,0,0.1)",
          borderWidth: 1,
          width: "100%",
          borderRadius: 16,
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "600" }}>Items</Text>

        {items.map((t, _) => (
          <View style={rowStyle} key={_}>
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text>{t.name}</Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.1)",
                  borderRadius: 25,
                  padding: 0,
                  paddingLeft: 8,
                  paddingRight: 8,
                }}
              >
                <Text>{t.quantity}</Text>
              </View>
              <Text style={{ fontWeight: "700" }}>
                {symbol} {t.value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );
};

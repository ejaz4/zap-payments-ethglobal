import React from "react";
import {
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from "react-native";

export const PaymentButton = ({
  image,
  label,
  ...props
}: {
  image: React.ReactNode;
  label: string;
} & TouchableOpacityProps) => {
  return (
    <TouchableOpacity
      style={{ justifyContent: "center", alignItems: "center" }}
      {...props}
    >
      <View
        style={{
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 50,
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.1)",
          padding: 16,
        }}
      >
        {image}
      </View>
      <Text>{label}</Text>
    </TouchableOpacity>
  );
};

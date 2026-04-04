export function formatBigInt(value: bigint, decimals = 18) {
  // Convert the bigint to a string
  let valueStr = value.toString();

  // Handle cases where the number is smaller than one unit
  if (valueStr.length <= decimals) {
    valueStr = valueStr.padStart(decimals + 1, "0");
  }

  // Insert the decimal point
  const integerPart = valueStr.slice(0, -decimals);
  let fractionalPart = valueStr.slice(-decimals);

  // Remove trailing zeros from the fractional part for a cleaner look
  fractionalPart = fractionalPart.replace(/0+$/, "");

  if (fractionalPart.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${fractionalPart}`;
}

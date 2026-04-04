import AsyncStorage from "@react-native-async-storage/async-storage";
import OpenAI from "openai";

// Set your OpenAI API key
const openai = new OpenAI({
  apiKey: process.env["EXPO_PUBLIC_OPENAI_API_KEY"],
});

// Default mock transaction payload
const defaultTransactionPayload = {
  amount: 150.0,
  currency: "USD",
  merchant: "Coffee Shop",
  location: "NYC",
  items: [
    { name: "Latte", qty: 2, price: 5.0 },
    { name: "Bagel", qty: 1, price: 3.0 },
  ],
};

const RULES_KEY = "rules";

export async function reviewTransaction(
  transactionPayload = defaultTransactionPayload,
): Promise<{
  decision: "accept" | "reject";
  reason: string;
}> {
  try {
    // Get rules from AsyncStorage
    let userRules = "";
    try {
      const val = await AsyncStorage.getItem(RULES_KEY);
      if (val) {
        const arr = JSON.parse(val);
        if (Array.isArray(arr) && arr.length > 0) {
          userRules = arr.join("\n");
        }
      } else {
        return { decision: "accept", reason: "No user rules set" };
      }
    } catch {}

    let transactions: any[] = [];
    try {
      const txVal = await AsyncStorage.getItem("transactions");
      if (txVal) {
        transactions = JSON.parse(txVal);
        if (!Array.isArray(transactions)) {
          transactions = [];
        }
      }
    } catch {
      transactions = [];
    }

    if (!userRules) {
      return { decision: "accept", reason: "No user rules set" };
    }

    // Get model from AsyncStorage, fallback to default
    let model = "gpt-4.1-nano";
    try {
      const storedModel = await AsyncStorage.getItem("ai_model");
      if (storedModel && typeof storedModel === "string") {
        model = storedModel;
      }
    } catch {}

    const prompt = `\
You are an AI assistant that reviews transaction payloads based on user rules. \
Transaction payload (as JSON), this is the current transaction that you need to assess: ${JSON.stringify(
      transactionPayload,
    )}\

 These are the past transactions, you can also use this information to make your decision: ${JSON.stringify(
   transactions
     .map((val) => {
       const { pk, ...items } = val;
       return items;
     })
     .filter((val) => !val.failReason),
 )}

User rules: ${userRules}\
\

A rule may reference criteria you might need to check, which can be done from the past transactions, use the past transactions and the information to assess whether this next transaction should be rejected. For reference, the current timestamp is: ${new Date(
      Date.now(),
    ).toUTCString()}

Decide whether to 'accept' or 'reject' the transaction. Output only a JSON object, no other formatting, with 'decision' (accept/reject) and 'reason' fields. Return the object as plaintext, NO formatting with backticks.\
`;

    console.log(prompt);
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
      max_tokens: 256,
    });

    if (!response.choices[0].message.content)
      return { decision: "accept", reason: "Could not parse AI" };
    console.log(response.choices[0].message.content);

    const result = response.choices[0].message.content.trim();

    return JSON.parse(result) as {
      decision: "accept" | "reject";
      reason: string;
    };
  } catch (error) {
    console.error("Error reviewing transaction:", error);
    return { decision: "accept", reason: "Could not parse AI" };
  }
}

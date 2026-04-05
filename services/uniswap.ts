/**
 * Uniswap Trading API client.
 *
 * React Native doesn't have CORS restrictions so we call the API directly
 * (no proxy needed unlike the web reference app).
 */

const BASE_URL = "https://trade-api.gateway.uniswap.org/v1";

/**
 * Valid Uniswap Trading API endpoints.
 */
type Endpoint =
  | "quote"
  | "swap"
  | "order"
  | "check_approval"
  | "swaps"
  | "orders";

/**
 * Call the Uniswap Trading API.
 *
 * @param endpoint - API endpoint (quote, swap, order, check_approval)
 * @param apiKey   - Uniswap API key
 * @param payload  - JSON request body
 * @returns Parsed response data + upstream HTTP status
 */
export async function uniswapApiCall(
  endpoint: Endpoint,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ data: any; status: number }> {
  const url = `${BASE_URL}/${endpoint}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      body?.detail ||
      body?.errorCode ||
      body?.error ||
      `Uniswap API returned ${res.status}`;
    throw new Error(msg);
  }

  if (body?.error) {
    throw new Error(body.error);
  }

  return { data: body, status: res.status };
}

/**
 * Injected Provider Script
 * This script is injected into WebViews to provide window.ethereum
 * Based on Rainbow's inpage.ts implementation
 *
 * Supports EIP-1193 provider interface and common RPC methods
 */

export const INJECTED_PROVIDER_SCRIPT = `
(function() {
  // Prevent double injection
  if (window.__ZAP_INJECTED__) return;
  window.__ZAP_INJECTED__ = true;

  // EIP-1193 Event Emitter
  class EventEmitter {
    constructor() {
      this._events = {};
    }
    on(event, listener) {
      if (!this._events[event]) this._events[event] = [];
      this._events[event].push(listener);
      return this;
    }
    once(event, listener) {
      const onceWrapper = (...args) => {
        listener(...args);
        this.removeListener(event, onceWrapper);
      };
      return this.on(event, onceWrapper);
    }
    emit(event, ...args) {
      if (!this._events[event]) return false;
      this._events[event].forEach(listener => listener(...args));
      return true;
    }
    removeListener(event, listener) {
      if (!this._events[event]) return this;
      this._events[event] = this._events[event].filter(l => l !== listener);
      return this;
    }
    removeAllListeners(event) {
      if (event) {
        delete this._events[event];
      } else {
        this._events = {};
      }
      return this;
    }
  }

  // Request ID counter
  let requestId = 0;
  const pendingRequests = {};

  // Provider state
  let isConnected = false;
  let selectedAddress = null;
  let chainId = null;

  // Create the provider
  const provider = new EventEmitter();
  
  // EIP-1193 required properties
  provider.isRainbow = true;
  provider.isZap = true;
  provider.isMetaMask = true; // For compatibility
  
  // Provider info for EIP-6963
  provider.providerInfo = {
    uuid: 'zap-wallet-' + Date.now(),
    name: 'Zap Wallet',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23569F8C"/><text x="50" y="65" font-size="40" text-anchor="middle" fill="white">⚡</text></svg>',
    rdns: 'app.zapwallet'
  };

  // Core request method (EIP-1193)
  provider.request = async function({ method, params = [] }) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingRequests[id] = { resolve, reject, method };

      // Send request to React Native
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'provider_request',
        id,
        method,
        params,
        origin: window.location.origin,
        host: window.location.host,
        title: document.title || window.location.hostname
      }));

      // Timeout after 5 minutes for signing requests
      const timeout = ['eth_sendTransaction', 'eth_signTransaction', 'personal_sign', 
        'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4',
        'eth_requestAccounts'].includes(method) ? 300000 : 30000;
      
      setTimeout(() => {
        if (pendingRequests[id]) {
          delete pendingRequests[id];
          reject(new Error('Request timed out'));
        }
      }, timeout);
    });
  };

  // Legacy methods for compatibility
  provider.send = function(methodOrPayload, paramsOrCallback) {
    // Handle both legacy patterns
    if (typeof methodOrPayload === 'string') {
      return provider.request({ method: methodOrPayload, params: paramsOrCallback || [] });
    }
    // Batch request pattern
    if (typeof paramsOrCallback === 'function') {
      provider.request(methodOrPayload)
        .then(result => paramsOrCallback(null, { id: methodOrPayload.id, jsonrpc: '2.0', result }))
        .catch(error => paramsOrCallback(error, null));
      return;
    }
    return provider.request(methodOrPayload);
  };

  provider.sendAsync = function(payload, callback) {
    if (Array.isArray(payload)) {
      // Handle batch requests
      Promise.all(payload.map(p => provider.request(p)))
        .then(results => callback(null, results.map((result, i) => ({ 
          id: payload[i].id, jsonrpc: '2.0', result 
        }))))
        .catch(error => callback(error, null));
    } else {
      provider.request(payload)
        .then(result => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
        .catch(error => callback(error, null));
    }
  };

  // EIP-1193 enable (deprecated but still used)
  provider.enable = function() {
    return provider.request({ method: 'eth_requestAccounts' });
  };

  // Connection status
  provider.isConnected = function() {
    return isConnected;
  };

  // Handle responses from React Native
  window.addEventListener('message', function(event) {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      
      if (data.type === 'provider_response') {
        const { id, result, error } = data;
        const pending = pendingRequests[id];
        
        if (pending) {
          delete pendingRequests[id];
          
          if (error) {
            const err = new Error(error.message || 'Unknown error');
            err.code = error.code || 4001;
            pending.reject(err);
          } else {
            // Update local state based on method
            if (pending.method === 'eth_requestAccounts' || pending.method === 'eth_accounts') {
              if (Array.isArray(result) && result.length > 0) {
                selectedAddress = result[0];
                isConnected = true;
              }
            } else if (pending.method === 'eth_chainId') {
              chainId = result;
            }
            pending.resolve(result);
          }
        }
      } else if (data.type === 'accountsChanged') {
        const accounts = data.accounts || [];
        selectedAddress = accounts[0] || null;
        provider.emit('accountsChanged', accounts);
      } else if (data.type === 'chainChanged') {
        chainId = data.chainId;
        provider.emit('chainChanged', data.chainId);
      } else if (data.type === 'connect') {
        isConnected = true;
        chainId = data.chainId;
        provider.emit('connect', { chainId: data.chainId });
      } else if (data.type === 'disconnect') {
        isConnected = false;
        selectedAddress = null;
        provider.emit('disconnect', { code: 4900, message: 'Disconnected' });
      }
    } catch (e) {
      // Ignore parsing errors from other messages
    }
  });

  // Legacy selectedAddress property
  Object.defineProperty(provider, 'selectedAddress', {
    get: function() { return selectedAddress; },
    enumerable: true
  });

  // Legacy chainId property
  Object.defineProperty(provider, 'chainId', {
    get: function() { return chainId; },
    enumerable: true
  });

  // Legacy networkVersion property
  Object.defineProperty(provider, 'networkVersion', {
    get: function() { 
      if (!chainId) return null;
      return String(parseInt(chainId, 16));
    },
    enumerable: true
  });

  // Announce provider (EIP-6963)
  function announceProvider() {
    const info = provider.providerInfo;
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info, provider })
    }));
  }

  // Listen for provider requests (EIP-6963)
  window.addEventListener('eip6963:requestProvider', announceProvider);

  // Set up window.ethereum
  const proxyHandler = {
    get(target, prop) {
      if (prop === 'providers') {
        return window.ethereum?.providers || [provider];
      }
      return Reflect.get(target, prop);
    }
  };

  const proxiedProvider = new Proxy(provider, proxyHandler);

  // Define ethereum on window
  Object.defineProperty(window, 'ethereum', {
    value: proxiedProvider,
    writable: false,
    configurable: true
  });

  // Also expose as rainbow for compatibility
  window.rainbow = provider;

  // Announce the provider
  setTimeout(announceProvider, 0);
  
  // Dispatch initialization event
  window.dispatchEvent(new Event('ethereum#initialized'));
  
  console.log('[Zap Wallet] Ethereum provider injected');
})();
true;
`;

/**
 * Script to get website metadata (favicon, title, background color)
 */
export const METADATA_SCRIPT = `
(function() {
  function getMetadata() {
    // Get favicon
    const icons = Array.from(document.querySelectorAll(
      "link[rel='apple-touch-icon'], link[rel='icon'], link[rel='shortcut icon']"
    ));
    
    let iconUrl = null;
    let maxSize = 0;
    
    for (const icon of icons) {
      const href = icon.getAttribute('href');
      const sizes = icon.getAttribute('sizes');
      
      if (sizes) {
        const size = Math.max(...sizes.split('x').map(n => parseInt(n, 10)));
        if (size > maxSize) {
          maxSize = size;
          iconUrl = href;
        }
      } else if (!iconUrl) {
        iconUrl = href;
      }
    }
    
    // Make icon URL absolute
    if (iconUrl && !iconUrl.startsWith('http')) {
      const base = window.location.origin;
      iconUrl = iconUrl.startsWith('/') ? base + iconUrl : base + '/' + iconUrl;
    }
    
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'metadata',
      title: document.title,
      icon: iconUrl,
      url: window.location.href
    }));
  }
  
  // Run on load
  if (document.readyState === 'complete') {
    getMetadata();
  } else {
    window.addEventListener('load', getMetadata);
  }
  
  // Also run after a short delay to catch dynamic updates
  setTimeout(getMetadata, 1000);
})();
true;
`;

/**
 * Combined injection script
 */
export const BROWSER_INJECTION_SCRIPT = `
${INJECTED_PROVIDER_SCRIPT}
${METADATA_SCRIPT}
`;

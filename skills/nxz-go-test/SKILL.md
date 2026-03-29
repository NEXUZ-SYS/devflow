---
name: nxz-go-test
description: Automate testing of the NXZ Go mobile app (com.moober_self_checkout) using Appium MCP. Use this skill whenever the user wants to test, automate, interact with, or run QA on the NXZ Go app, the Moober self-checkout app, NXZ, or mentions testing a POS/self-checkout app on Android. Also trigger when the user says "test NXZ", "run NXZ Go test", "automate NXZ Go", "testar NXZ", or asks about E2E testing the self-checkout app.
---

# NXZ Go Test Automation

Automate testing of **NXZ Go** — a React Native POS/self-checkout system connected to Odoo/Supabase/Firebase.

## App Details

| Field | Value |
|-------|-------|
| **Package** | `com.moober_self_checkout` |
| **Framework** | React Native 0.81 + TypeScript |
| **Navigation** | React Navigation 7 (native-stack, drawer, bottom-tabs) |
| **State** | React Context API (Auth, Cart, Store, Modal, Alert, PDV, KDS) |
| **Deep link** | `nxz://` / `https://nxz.nexuz.app` |
| **Backend** | Odoo + Firebase/Supabase (dual DB) |
| **Source code** | `/home/walterfrey/Documentos/code/nexuz/nxz_go_play_store/` |

## Element Finding Strategy

The app has **148+ testID props** on all major screens. For Appium, React Native `testID` maps to Android `accessibility id`. This is the **preferred strategy** — always try `accessibility id` first.

```javascript
// Preferred: use accessibility id (maps to React Native testID)
await callTool('appium_find_element', {
  strategy: 'accessibility id',
  selector: 'start-enter',
});

// Fallback: UiAutomator text selector (for native Android screens like Settings)
await callTool('appium_find_element', {
  strategy: '-android uiautomator',
  selector: 'new UiSelector().textContains("Executar")',
});

// Last resort: coordinates (only for elements without testID)
await callTool('appium_tap_by_coordinates', { x: 100, y: 280 });
```

**Exception — Settings screen**: The "Configurações" screen (gear icon on Start screen) is a native Android PreferenceScreen, not React Native. Use UiAutomator text selectors or coordinates there. The gear icon itself has testID `start-settings` but the settings content inside uses native Android views.

## TestID Reference

### Authentication & Startup

| testID | Screen | Element |
|--------|--------|---------|
| `welcome-configuration` | Welcome | Screen container |
| `welcome-version` | Welcome | Version text |
| `sign-in` | SignIn | Screen container |
| `signin-base` | SignIn | Base URL input |
| `signin-email` | SignIn | Email input |
| `signin-pass` | SignIn | Password input |
| `sigin-enter` | SignIn | Sign in button (**note typo**: "sigin") |
| `signin-recovery` | SignIn | Recovery button |
| `signin-reset` | SignIn | Reset button |
| `signin-device-id` | SignIn | Device ID display |
| `start` | Start | Screen container |
| `start-settings` | Start | Settings/gear button |
| `start-enter` | Start | "Iniciar" button |

### PDV (Point-of-Sale) Flow

| testID | Screen | Element |
|--------|--------|---------|
| `start-customer-order` | StartCustomerOrder | Screen container |
| `new-order` | StartCustomerOrder | New order button |
| `change-to-kds` | StartCustomerOrder | Switch to KDS mode |
| `screen-saver` | ScreenSaver | Idle screen |
| `customer-identification` | CustomerIdentification | Screen container |
| `input-name` | CustomerIdentification | Customer name input |
| `button-pricelist` | CustomerIdentification | Pricelist button |
| `button-next` | CustomerIdentification | Next button |
| `dine-options` | DineOptions | Screen container |
| `products-list` | ProductsList | Screen container |
| `category-card-{index}` | ProductsList | Category (0-based) |
| `product-card-{index}` | ProductsList | Product (0-based) |
| `cancel-order` | ProductsList | Cancel order |
| `button-cart-icon` | ProductsList | Cart icon button |
| `button-cart-text` | ProductsList | Cart text button |

### Product Detail & Customization

| testID | Element |
|--------|---------|
| `modal-product` | Product detail modal |
| `detail` | Detail section |
| `button-detail-minus` | Quantity decrease |
| `input-detail-qty` | Quantity input |
| `button-detail-plus` | Quantity increase |
| `button-detail-next` | Next step |
| `button-detail-back` | Back |
| `variant` | Variant selection |
| `variant-button-{index}` | Variant option (0-based) |
| `customization` | Customization screen |
| `button-add-customization` | Add customization |

### Shopping Cart & Payment

| testID | Element |
|--------|---------|
| `shopping-cart` | Cart screen |
| `cart-item-{index}` | Cart item (0-based) |
| `input-document` | CPF/document input |
| `input-discount` | Discount input |
| `button-discount` | Apply discount |
| `button-payment` | Proceed to payment |
| `payment-options` | Payment options screen |
| `button-pay-now` | Pay now |
| `button-split` | Split payment |
| `payment-change` | Change screen |
| `input-amount` | Amount input |
| `button-pay` | Final pay button |
| `paying` | Processing screen |
| `send-sale` | Send sale screen |
| `success-order` | Success screen |
| `error-order` | Error screen |

### NF (Nota Fiscal)

| testID | Element |
|--------|---------|
| `nf-status` | NF status screen |
| `button-nf-no` | No NF |
| `button-nf-yes` | Yes NF |
| `button-nf-email` | Send by email |
| `customer-email` | Email input screen |

### KDS (Kitchen Display)

| testID | Element |
|--------|---------|
| `home` | KDS home tab |
| `delivery` | Delivery tab |
| `history` | History tab |
| `order-{index}` | Order item (0-based) |

### Modals (all types follow pattern `modal-{type}`)

| testID | Element |
|--------|---------|
| `modal-loading` | Loading modal |
| `modal-error` | Error modal |
| `modal-success` | Success modal |
| `modal-confirm` | Confirm modal |
| `modal-password` | Password modal |
| `modal-button-confirm` | Confirm button |
| `modal-button-cancel` | Cancel button |
| `modal-text-code` | Error code text |
| `modal-input` | Password input |

### Configuration & Utilities

| testID | Element |
|--------|---------|
| `configuration` | Configuration screen |
| `option-{id}-{option.id}` | Config option |
| `payment-bluetooth` | Bluetooth config |
| `printer` | Printer config |
| `button-toggle-printer` | Toggle printer |
| `button-activate-printer` | Activate printer |

## Navigation Routes

```
App (Stack)
├── WelcomeConfiguration
├── SignIn
├── Configuration
├── Start ← home after auth, has gear icon + "Iniciar"
├── Details
├── PaymentBluetooth
├── Printer
└── Main (Drawer)
    ├── Pdv (Stack)
    │   ├── StartCustomerOrder ← PDV home
    │   ├── ScreenSaver
    │   ├── CustomerIdentification
    │   ├── DineOptions
    │   ├── ProductsList
    │   ├── ShoppingCart
    │   ├── Customization
    │   ├── PaymentOptions / PaymentCode / PaymentType / PaymentValue
    │   ├── Paying → SendSale → SuccessOrder / ErrorOrder
    │   └── NFStatus → NFStatusEmail → CustomerEmail
    ├── Kds (Tabs)
    │   ├── Home
    │   ├── Delivery (if iFood configured)
    │   └── History
    ├── Products
    └── OrderManagement
```

## MCP Server Setup

```bash
# Ensure Appium server is running
curl -s http://localhost:4723/status || appium &

# Ensure appium-mcp is running (httpStream mode)
curl -s http://localhost:8080/sse > /dev/null 2>&1 || {
  export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
  export ANDROID_HOME=$HOME/Android/Sdk
  export PATH=$JAVA_HOME/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH
  cd /home/walterfrey/Documentos/code/appium-mcp
  nohup node dist/index.js --httpStream --port=8080 > /tmp/mcp-server.log 2>&1 &
}
```

## Test Script Boilerplate

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:8080/sse'));
const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(transport);

async function callTool(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  return result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n');
}

function extractUUID(findResult) {
  const match = findResult?.match(/Element id (.+?)(?:\s|$|;)/);
  if (!match) throw new Error(`No UUID in: ${findResult}`);
  return match[1];
}

async function findAndClick(strategy, selector) {
  const r = await callTool('appium_find_element', { strategy, selector });
  const uuid = extractUUID(r);
  await callTool('appium_click', { elementUUID: uuid });
  return uuid;
}

async function findAndType(strategy, selector, text) {
  const r = await callTool('appium_find_element', { strategy, selector });
  const uuid = extractUUID(r);
  await callTool('appium_set_value', { elementUUID: uuid, text });
  return uuid;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
```

## Session Setup (always do this first)

```javascript
// 1. Get device UDID: run `adb devices` to find it
await callTool('select_platform', { platform: 'android' });
await callTool('select_device', { platform: 'android', deviceUdid: '<DEVICE_UDID>' });
await callTool('create_session', {
  platform: 'android',
  capabilities: { 'appium:noReset': true, 'appium:autoGrantPermissions': true },
});
await callTool('appium_activate_app', { id: 'com.moober_self_checkout' });
await sleep(5000); // wait for React Native JS bundle to load
```

## Common Test Flows

### Flow: Login

```javascript
// Wait for SignIn screen
await findAndType('accessibility id', 'signin-base', 'gocoffee');
await findAndType('accessibility id', 'signin-email', 'pdv1@spavpaulista.com.br');
await findAndType('accessibility id', 'signin-pass', '102030');
await findAndClick('accessibility id', 'sigin-enter'); // note typo in testID
await sleep(5000);
```

### Flow: Open Settings (from Start screen)

```javascript
// The gear icon has testID 'start-settings' but it's a small icon.
// Try accessibility id first; fall back to coordinates if needed.
try {
  await findAndClick('accessibility id', 'start-settings');
} catch {
  await callTool('appium_tap_by_coordinates', { x: 100, y: 280 });
}
await sleep(3000);
```

### Flow: Run Connection Test

```javascript
// Open settings first (see above)
// Settings is native Android — scroll and find by text
await callTool('appium_swipe', {
  startX: 720, startY: 2400, endX: 720, endY: 800, duration: 500,
});
await sleep(1000);
await findAndClick('-android uiautomator', 'new UiSelector().textContains("xecutar")');
```

### Flow: Start New Order (PDV)

```javascript
await findAndClick('accessibility id', 'start-enter'); // "Iniciar"
await sleep(3000);
await findAndClick('accessibility id', 'new-order');    // "Novo Pedido"
await sleep(2000);
// Customer identification
await findAndType('accessibility id', 'input-name', 'Cliente Teste');
await findAndClick('accessibility id', 'button-next');
```

### Flow: Browse Products & Add to Cart

```javascript
// Select first category
await findAndClick('accessibility id', 'category-card-0');
await sleep(1000);
// Select first product
await findAndClick('accessibility id', 'product-card-0');
await sleep(1000);
// In product modal: increase quantity and add
await findAndClick('accessibility id', 'button-detail-plus');
await findAndClick('accessibility id', 'button-detail-next');
// Go to cart
await findAndClick('accessibility id', 'button-cart-icon');
```

### Flow: Complete Payment

```javascript
// From shopping cart
await findAndClick('accessibility id', 'button-payment');
await sleep(2000);
await findAndClick('accessibility id', 'button-pay-now');
await sleep(2000);
// Wait for payment processing
await sleep(5000);
// Check for success or error
await callTool('appium_screenshot');
```

### Flow: Full Happy Path (Login → Order → Pay)

```javascript
// 1. Login
await findAndType('accessibility id', 'signin-base', 'gocoffee');
await findAndType('accessibility id', 'signin-email', 'pdv1@spavpaulista.com.br');
await findAndType('accessibility id', 'signin-pass', '102030');
await findAndClick('accessibility id', 'sigin-enter');
await sleep(5000);

// 2. Start
await findAndClick('accessibility id', 'start-enter');
await sleep(3000);

// 3. New order
await findAndClick('accessibility id', 'new-order');
await sleep(2000);

// 4. Customer name
await findAndType('accessibility id', 'input-name', 'Cliente Teste');
await findAndClick('accessibility id', 'button-next');
await sleep(2000);

// 5. Select dine option (first available)
await callTool('appium_screenshot'); // see options available
// Tap the appropriate dine option

// 6. Browse products
await findAndClick('accessibility id', 'category-card-0');
await sleep(1000);
await findAndClick('accessibility id', 'product-card-0');
await sleep(1000);
await findAndClick('accessibility id', 'button-detail-next');
await sleep(1000);

// 7. Cart → Payment
await findAndClick('accessibility id', 'button-cart-icon');
await sleep(1000);
await findAndClick('accessibility id', 'button-payment');
await sleep(2000);
await findAndClick('accessibility id', 'button-pay-now');
await sleep(5000);

// 8. Verify result
await callTool('appium_screenshot');
```

## Handling Dialogs & Modals

```javascript
// Dismiss error modal
try {
  await findAndClick('accessibility id', 'modal-button-confirm');
} catch { /* no modal present */ }

// Check for loading modal
try {
  await callTool('appium_find_element', {
    strategy: 'accessibility id', selector: 'modal-loading',
  });
  // Wait for loading to finish
  await sleep(5000);
} catch { /* not loading */ }
```

## Existing Maestro Tests (reference)

The app has Maestro E2E tests in `e2e/` that serve as reference for test flows:

```
e2e/
├── main.yml                    # Entry point
├── auth/login.yml              # Login flow
├── config/                     # Configuration checks
└── pipes/
    ├── pdv-totem/              # Totem mode tests
    ├── pdv-caixa/              # Cashier mode tests
    ├── pdv-kds/                # POS+KDS tests
    ├── kds/                    # KDS-only tests
    └── happy-test/             # Full happy path
```

Read these files for detailed step-by-step test flows with expected assertions.

## Test Credentials (from .env.example)

```
AUTH_BASE=gocoffee
AUTH_EMAIL=pdv1@spavpaulista.com.br
AUTH_PASSWORD=102030
```

## Cleanup

Always delete the session when done:

```javascript
try { /* test steps */ }
catch (error) {
  console.error('Failed:', error.message);
  await callTool('appium_screenshot');
}
finally {
  await callTool('delete_session');
  await client.close();
}
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| testID not found | Take screenshot to verify correct screen; React Native may not have finished navigating |
| Settings elements not found by testID | Settings is native Android — use `-android uiautomator` with text selectors |
| `start-settings` tap doesn't open settings | Fall back to `appium_tap_by_coordinates` at (100, 280) for 1440x3120 screens |
| `scroll_to_element` fails | Use `appium_swipe` manually: `{startX: 720, startY: 2400, endX: 720, endY: 800}` |
| Modal blocking interaction | Dismiss with `modal-button-confirm` or `modal-button-cancel` |
| `sigin-enter` not found | The testID has a typo — it's `sigin-enter` not `signin-enter` |
| Session creation timeout | Add `'appium:adbExecTimeout': 60000` to capabilities |

# Zano Trade Bot

A trading bot for the Zano Trade Dex ([https://trade.zano.org](https://trade.zano.org)) that automates trading using [Ionic Swaps](https://docs.zano.org/docs/build/confidential-assets/ionic-swaps). The bot connects to your Zano wallet running on a remote or local server and places orders on your behalf via the Zano Trade API based on configurations provided.

---

## Features
- Automated trading on Zano Trade Dex using pre-configured pairs and prices.
- Direct integration with your wallet to ensure your coins never leave your control.
- Background trading without manual interaction.

---

## Prerequisites
1. **Zano Wallet**:
   - You need to set up a Zano wallet and enable RPC mode.
   - Follow this guide to configure your wallet in RPC mode: [Running Daemon and Wallet in RPC Mode](https://docs.zano.org/docs/build/rpc-api/overview#running-daemon-and-wallet-in-rpc-mode-brief-guide).

2. **Environment Variables File**:
   - The bot requires an `.env` file with the following variables:

     ```env
     CUSTOM_SERVER="https://trade.zano.org"
     API_TOKEN=""
     SIMPLEWALLET_PORT="10500"
     ZANOD_URL="http://37.27.100.59:10500"
     DELETE_ON_START="true"
     ```

   - Explanation of Variables:
     - `CUSTOM_SERVER`: URL of the Zano Trade Dex server (default: `https://trade.zano.org`).
     - `API_TOKEN`: Your API token for authenticating with the trade bot (leave blank if not required).
     - `SIMPLEWALLET_PORT`: The RPC port your wallet is running on.
     - `ZANOD_URL`: URL and port of the Zano daemon (example uses [public node](https://docs.zano.org/docs/build/public-nodes)).
     - `DELETE_ON_START`: If set to `true`, clears all previously pending orders when the bot starts.

3. **Price/Pair Configuration**:
   - Provide a JSON file with trading pair configurations:

     ```json
     [
         {
             "pair_url": "https://trade.zano.org/dex/trading/179",
             "amount": "6812000",
             "price": "0.0014679976",
             "type": "SELL"
         },
         {
             "pair_url": "https://trade.zano.org/dex/trading/179",
             "amount": "6812000",
             "price": "0.00029359952",
             "type": "BUY"
         }
     ]
     ```

   - Explanation of Fields:
     - `pair_url`: URL of the trading pair (from Zano Trade Dex).
     - `amount`: Amount of coins for the trade (in atomic units).
     - `price`: Price for the trade.
     - `type`: Trade type (`BUY` or `SELL`).

---

## Setup and Usage
1. Clone the repository:
   ```bash
   git clone https://github.com/PRavaga/zano-trade-bot.git
   cd zano-trade-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure the bot:
   - Create a `.env` file in the root directory with the required environment variables.
   - Provide the price/pair configuration in `config.json`.

4. Start the bot:
   ```bash
   npm start
   ```

---

## Documentation Articles

### 1. **Setting Up Your Wallet in RPC Mode**
   - Link: [Running Daemon and Wallet in RPC Mode](https://docs.zano.org/docs/build/rpc-api/overview#running-daemon-and-wallet-in-rpc-mode-brief-guide)

### 2. **Environment Variables Explained**
   - Detailed guide on configuring the `.env` file and its variables.

### 3. **Creating Price/Pair Configurations**
   - Step-by-step instructions for generating a trading pair configuration JSON file.

### 4. **Deploying and Running the Bot**
   - Comprehensive guide to setting up, deploying, and running the trading bot on your local or remote server.

---

## Additional Resources
- [Zano Trade Dex](https://trade.zano.org)
- [Zano Documentation](https://docs.zano.org)
- [Ionic Swaps Overview](https://docs.zano.org/docs/build/confidential-assets/ionic-swaps)

---

## RestAPI ENDPOINTS
**base URL** - [https://trade.zano.org]

### 1. **Authenticate in system**:
-``METHOD``: 'POST'  
-`PATH`: `/api/auth`  
-`BODY`: 
```typescript
{  
   token: string,  
   pairId: number,  
}
```

### 2. **Get page of user's orders**
-`METHOD`: 'POST'  
-`PATH`: `/api/orders/get-user-page`  
-`BODY`: 
```typescript
{  
   token: string,  
   pairId: number,  
}
```

### 3. **Create order**
-`METHOD`: 'POST'  
-`PATH`: `/api/orders/create`  
-`BODY`: 
```typescript
{  
   token: string,  
   orderData: CreateOrderData   
}
```

### 4. **Delete user's order**
-`METHOD`: 'POST'  
-`PATH`: `/api/orders/cancel`  
-`BODY`: 
```typescript
{  
   token: string,  
   orderId: number,  
}
```

### 5. **Apply user's order**
-`METHOD`: 'POST'  
-`PATH`: `/api/orders/apply-order`  
-`BODY`: 
```typescript
{  
   token: string,  
   orderData: ApplyOrderData, 
}  
```

### 6. **Сonfirm transaction**
-`METHOD`: 'POST'  
-`PATH`: `/api/transactions/confirm`  
-`BODY`: 
```typescript
{  
   token: string,  
   transactionId: number, 
}  
```

### 7. **Get info about a DEX trading pair**
-`METHOD`: 'POST'  
-`PATH`: `/api/dex/get-pair`  
-`BODY`: 
```typescript
{  
   id: number 
}  
```

### 8. **Ping activity checker**
-`METHOD`: 'POST'  
-`PATH`: `/api/dex/renew-bot`  
-`BODY`: 
```typescript
{  
   token: string,  
   orderId: number, 
}  
```

### 9. **Get active Tx by orders' Ids**
-`METHOD`: 'POST'  
-`PATH`: `/api/transactions/get-active-tx-by-orders-ids`  
-`BODY`: 
```typescript
{  
   token: string,  
   firstOrderId: number, 
   secondOrderId: number, 
}  
```
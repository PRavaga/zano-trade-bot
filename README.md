# Zano Trade Bot - Exchange edition

A trading bot for the Zano Trade Dex ([https://trade.zano.org](https://trade.zano.org)) that automates trading using [Ionic Swaps](https://docs.zano.org/docs/build/confidential-assets/ionic-swaps). The bot connects to your Zano wallet running on a remote or local server and places orders on your behalf via the Zano Trade API based on prices fetched from exchange.

---

## Setting up

**Environment Variables File**:
   - The bot requires an `.env` file with the following variables:

     ```env
     CUSTOM_SERVER="https://trade.zano.org"
     API_TOKEN=""
     SIMPLEWALLET_PORT="10500"
     ZANOD_URL="http://37.27.100.59:10500"
     DELETE_ON_START="true"

     PRICE_INTERVAL_SEC="10"
     PRICE_SELL_PERCENT="5"
     PRICE_BUY_PERCENT="5"
     PRICE_CHANGE_SENSITIVITY_PERCENT="10"
     DEPTH_CHANGE_SENSITIVITY_PERCENT="10"
     PARSER_ENABLED="true"
     ```

   - Explanation of Variables:
     - `CUSTOM_SERVER`: URL of the Zano Trade Dex server (default: `https://trade.zano.org`).
     - `API_TOKEN`: Your API token for authenticating with the trade bot (leave blank if not required).
     - `SIMPLEWALLET_PORT`: The RPC port your wallet is running on.
     - `ZANOD_URL`: URL and port of the Zano daemon (example uses [public node](https://docs.zano.org/docs/build/public-nodes)).
     - `PRICE_INTERVAL_SEC`: Price fetch time
     - `PRICE_SELL_PERCENT`: % to add to the price for selling.
     - `PRICE_BUY_PERCENT`: % to subtract from the price for buying.
     - `PRICE_CHANGE_SENSITIVITY_PERCENT`: Allowed slippage for price changes.
     - `DEPTH_CHANGE_SENSITIVITY_PERCENT`: Allowed slippage for depth changes.
     - `PARSER_ENABLED`: If set to `true`, enables api parser


**Pair Configuration**:
   - Provide a JSON file with trading pair configurations:

     ```json
     [
         {
             "pair_url": "https://trade.zano.org/dex/trading/179",
             "amount": "6812000",
             "type": "SELL"
         },
         {
             "pair_url": "https://trade.zano.org/dex/trading/179",
             "amount": "6812000",
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

# Trade API for custom bots

## Additional Resources
- [Zano Trade Dex](https://trade.zano.org)
- [Zano Documentation](https://docs.zano.org)
- [Ionic Swaps Overview](https://docs.zano.org/docs/build/confidential-assets/ionic-swaps)

## RestAPI ENDPOINTS
**base URL** - https://trade.zano.org

### 1. **Authenticate in system**:
- `METHOD`: <kbd>POST</kbd><br>  
- `PATH`: `/api/auth`<br>  
#### Request:  
```typescript
{  
   data: {
      address: string,  
      alias: string,  
      message: string,  
      signature: string,
   },    
   neverExpires: boolean,    
}
```
>Explanation of Fields:  
>- To get ```data``` you should [sign some message using Zano wallet](https://docs.zano.org/docs/build/rpc-api/wallet-rpc-api/sign_message/) (random string)

#### Response:
```typescript
   success: boolean;
   data?: string // error message 
```
---

### 2. **Get your active orders**
- `METHOD`: <kbd>POST</kbd><br>  
- `PATH`: `/api/orders/get-user-page`<br>  
#### Request:  
```typescript
{  
   token: string,  
   pairId: number,  
}
```
#### Response:
```typescript
   success: boolean;
   data: {
        orders: {
            id: number;
            type: string;
            timestamp: string;
            side: string;
            price: string;
            amount: string;
            total: string;
            pair_id: number;
            user_id: number;
            status: string;
            left: string;
            hasNotification: boolean;
            createdAt: string;
            updatedAt: string;
            isInstant: boolean;
        }[];

        applyTips: {
            id: number;
            left: string;
            price: string;
            user: {
                alias: string;
                address: string;
                createdAt: string;
                updatedAt: string;
            };
            type: string;
            total: string;
            connected_order_id: number;
            transaction: boolean;
            hex_raw_proposal: string;
            isInstant: boolean;
        }[];
    }
```
---

### 3. **Create new order**
- `METHOD`: <kbd>POST</kbd><br>  
- `PATH`: `/api/orders/create`<br>  
#### Request:  
```typescript
{  
   token: string,  
   orderData: {
      type: 'buy' | 'sell'; 
      side: "limit"  // field naming will be fixed soon. It won't effect bots, both field name will work
      price: string;
      amount: string;
      pairId: number;
   }   
}
```
#### Response:
```typescript
   success: boolean;
   data?: string // error message 
```
---

### 4. **Delete your order**
- `METHOD`: <kbd>POST</kbd><br>  
- `PATH`: `/api/orders/cancel`<br>  
#### Request:  
```typescript
{  
   token: string,  
   orderId: number,  
}
```
#### Response:
```typescript
   success: boolean;
   data?: string // error message 
```
---

### 5. **Apply for matched order**
> Use this method to apply if another side hasn't done it yet. 
> You can check if they applied by **transaction** field in applyTips. If it's `false` you can apply for it otherwise you are the finalizer and should use **Сonfirm transaction** method.
- `METHOD`: <kbd>POST</kbd><br>  
- `PATH`: `/api/orders/apply-order`<br> 
#### Request:  
```typescript
{  
   token: string,  
   orderData: {
      id: string;
      connected_order_id: string;
      hex_raw_proposal: string; 
   }, 
}  
```
>Explanation of Fields:  
>- to get `hex_raw_proposal` create [ionic swap proposal](https://docs.zano.org/docs/build/rpc-api/wallet-rpc-api/ionic_swap_generate_proposal/) via Zano wallet API;
>- hex_raw_proposal - Hex-encoded proposal raw data(encrypted with common shared key). Includes half-created transaction template and some extra information that would be needed counterparty to finialize and sign transaction
#### Response:
```typescript
   success: boolean;
   data?: string // error message 
```
---

### 6. **Сonfirm transaction**
> Use this method to confirm that you have finalized the transaction (order or part). You can get its id from **get-active-tx-by-orders-ids** method
- `METHOD`: <kbd>POST</kbd><br>  
- `PATH`: `/api/transactions/confirm`<br>  
#### Request:  
```typescript
{  
   token: string,  
   transactionId: number, 
}  
```
#### Response:
```typescript
   success: boolean;
   data?: string // error message 
```
---

### 7. **Get info about a DEX trading pair**
- `METHOD`: <kbd>POST</kbd><br>  
- `PATH`: `/api/dex/get-pair`<br>  
#### Request:  
```typescript
{  
   id: number 
}  
```
---

### 8. **Ping activity checker**   
>*You should call this method every 10 seconds to keep ``instant`` icon, so users know that your bot will accept the order immediately.

![instant icon](./assets/images/instant.jpg)*
- `METHOD`: <kbd>POST</kbd><br>  
- `PATH`: `/api/dex/renew-bot`<br>  
#### Request:  
```typescript
{  
   token: string,  
   orderId: number, 
}  
```
#### Response:
```typescript
   sucess: boolean;
   data?: string // error message
```
---

### 9. **Get active Tx by orders' Ids**
> Get active transaction data by matching 2 orders. 
So you can check if the transaction is already confirmed by another user and/or get proposal hex.
- `METHOD`: <kbd>POST</kbd><br>  
- `PATH`: `/api/transactions/get-active-tx-by-orders-ids`<br>  
#### Request: 
```typescript
{  
   token: string,  
   firstOrderId: number, 
   secondOrderId: number, 
}  
```
#### Response:
```typescript
   success: boolean;
   data?: {
      buy_order_id: number;
      sell_order_id: number;
      amount: string;
      timestamp: number;
      status: string;
      creator: string;
      hex_raw_proposal: string;
   } | string // error message
```
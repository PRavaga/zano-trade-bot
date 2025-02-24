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
     PRICE_SELL_DEPTH_PERCENT="50"
     PRICE_BUY_DEPTH_PERCENT="50"
     PRICE_CHANGE_SENSITIVITY_PERCENT="10"
     PARSER_ENABLED="true"
     ```

   - Explanation of Variables:
     - `CUSTOM_SERVER`: URL of the Zano Trade Dex server (default: `https://trade.zano.org`).
     - `API_TOKEN`: Your API token for authenticating with the trade bot (leave blank if not required).
     - `SIMPLEWALLET_PORT`: The RPC port your wallet is running on.
     - `ZANOD_URL`: URL and port of the Zano daemon (example uses [public node](https://docs.zano.org/docs/build/public-nodes)).
     - `DELETE_ON_START`: If set to `true`, clears all previously pending orders when the bot starts.
     - `PRICE_INTERVAL_SEC`: Price fetch time
     - `PRICE_SELL_DEPTH_PERCENT`:
     - `PRICE_BUY_DEPTH_PERCENT`:
     - `PRICE_CHANGE_SENSITIVITY_PERCENT`: Allowed slippage
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


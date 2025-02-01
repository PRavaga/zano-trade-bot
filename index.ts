import SocketClient from "./socket-client";
import { ZanoWallet } from "./utils/zano-wallet";
import { FetchUtils } from "./utils/fetch-methods";
import AuthParams from "./interfaces/fetch-utils/AuthParams";
import logger from "./logger";
import * as env from "./env-vars";
import { getObservedOrder, getPairData, onOrdersNotify } from "./utils/utils/utils";
import { ConfigItemParsed } from "./interfaces/common/Config";
import sequelize from "./database";
import Order from "./schemes/Order";
import PairData from "./interfaces/common/PairData";
import xeggexParser, { MarketState } from "./utils/price-parser";
import Decimal from "decimal.js";


const ACTIVITY_PING_INTERVAL = 15 * 1000;

const activeSocketClients: SocketClient[] = [];
const activeIntervals: NodeJS.Timeout[] = [];

async function thread(configItem: ConfigItemParsed) {
    const socketClient = new SocketClient();
    let socket = socketClient.initSocket();

    activeSocketClients.push(socketClient);

    logger.detailedInfo("Starting bot...");

    logger.detailedInfo("Fetching trading pair data...");
    const pairData = await getPairData(configItem.pairId);

    logger.detailedInfo("Fetching wallet data from Zano App...");

    let tradeAuthToken: string;

    const res = await ZanoWallet.getWalletData();

    logger.detailedInfo(`Wallet data fetched: `);
    logger.detailedInfo(res);

    if (!res.alias) {
        throw new Error("Zano App selected wallet does not have an alias. Select any wallet that has an alias.");
    }

    logger.detailedInfo("Authenticating at Zano Trade...");

    let authRes: any;

    try {
        authRes = await FetchUtils.auth(res as AuthParams);
    } catch (err: any) {
        logger.error(`Zano Trade auth request failed: `);
        throw err;
    }

    if (!authRes?.success) {
        throw new Error(`Zano Trade auth request is successful, but auth failed: ${authRes.message}`);
    } else {
        tradeAuthToken = authRes.data;
    }

    logger.detailedInfo("Authentication successful.");
    logger.detailedInfo("Getting observed order...");

    const observedOrderId = await getObservedOrder(tradeAuthToken, configItem).catch(err => {
        logger.error(`Error getting observed order: ${err}`);
        return null;
    });

    if (!observedOrderId) {
        logger.error("No observed order found. Exiting thread...");
        return;
    }

    logger.detailedInfo(`Observed order id: ${observedOrderId}`);


    logger.detailedInfo("Starting activity checker...");

    async function pingActivity() {

        if (!observedOrderId) {
            return;
        }

        return FetchUtils.pingActivityChecker(observedOrderId, tradeAuthToken)
            .catch(err => {
                logger.error(`Activity checker ping failed: ${err}`);
            });
    }

    pingActivity();

    const activityInterval = setInterval(() => {
        pingActivity();
    }, ACTIVITY_PING_INTERVAL);

    activeIntervals.push(activityInterval);

    logger.detailedInfo(`Will ping activity checker every ${ACTIVITY_PING_INTERVAL / 1000} seconds.`);


    // logger.detailedInfo("Listener will start in 10 seconds...");
    // await new Promise(resolve => setTimeout(resolve, 10000));

    const notificationParams: [
        string,
        number,
        PairData,
        string | null
    ] = [tradeAuthToken, observedOrderId, pairData, configItem.trade_id];

    await onOrdersNotify(...notificationParams);




    logger.detailedInfo("Subscribing to Zano Trade WS events...");

    function setSocketListeners() {
        socket.emit("in-trading", { id: configItem.pairId });

        socket.on("new-order", async () => {
            logger.info(`New order message incoming via WS, starting order notification handler...`);
            await onOrdersNotify(...notificationParams);
        });

        socket.on("delete-order", async () => {
            console.log("DELETE ORDER", notificationParams);
            logger.info(`Order deleted message incoming via WS, starting order notification handler...`);
            await onOrdersNotify(...notificationParams);
        });

        socket.on("update-orders", async () => {
            logger.info(`Orders update message incoming via WS, starting order notification handler...`);
            await onOrdersNotify(...notificationParams);
        });

        socket.on("disconnect", async (reason) => {
            logger.warn(`Socket disconnected due to ${reason}. Attempting to reconnect...`);

            try {
                socket = socketClient.reconnectSocket();
                setSocketListeners();
            } catch (error) {
                logger.error(`Reconnection attempt failed: ${error}`);
            }
        });
    }

    setSocketListeners();

    logger.info("Bot started.");
}


(async () => {

    await sequelize.sync({});

    logger.detailedInfo("Database synced!");

    const allSavedorders = await Order.findAll();


    for (const element of allSavedorders) {
        const configItem = env.readConfig.find(configItem => configItem.trade_id === element.trade_id);

        if (!configItem) {
            await element.destroy();
            continue;
        }

        const elementPairid = element.pair_url?.split("/").at(-1);

        if (
            (!element.price.equals(configItem.price) && !env.PARSER_ENABLED) ||
            (!elementPairid || parseInt(elementPairid, 10) !== configItem.pairId)
            || !element.amount.equals(configItem.amount)
        ) {
            logger.detailedInfo(`Deleting saved order due to price or pair_id or amount mismatch`);
            await element.destroy();
            continue;
        }

        logger.detailedInfo(`Found saved order for pair ${configItem.pairId}...`);

    }

    if (env.PARSER_ENABLED) {
        logger.detailedInfo("Parser is enabled. Initializing parser...");
        await xeggexParser.init();
        logger.detailedInfo("Parser initialized.");
    }

    if (env.PARSER_ENABLED) {

        function getConfigWithLivePrice(marketState: MarketState) {
            const preparedConfig = env.readConfig.map((item: ConfigItemParsed, index: number) => {
                const newPrice = item.type === "buy" ? marketState.buyPrice : marketState.sellPrice;

                const updatedAt = marketState.updatedAt || 0;

                if (updatedAt + (env.PRICE_INTERVAL_SEC * 1000 * 3) < +new Date()) {
                    logger.error(`Price for pair ${item.pairId} is outdated. Skipping...`);
                    return false;
                }

                if (!newPrice) {
                    logger.error(`Price for pair ${item.pairId} is not available. Skipping...`);
                    return false;
                }

                return {
                    ...item,
                    price: new Decimal(newPrice)
                }
            }).filter(e => !!e);

            return preparedConfig;
        }

        async function updateConfig() {

            for (const element of activeSocketClients) {
                try {
                    element.destroySocket();
                } catch (error) {
                    logger.error(`Error destroying socket: ${error}`);
                }
            }

            for (const interval of activeIntervals) {
                clearInterval(interval);
            }

            const marketState = xeggexParser.getMarketState();
            const preparedConfig = getConfigWithLivePrice(marketState);

            console.log("Prepared config: ", preparedConfig);


            for (const configItem of preparedConfig) {
                logger.detailedInfo(`Starting bot for pair ${configItem.pairId}...`);
                logger.detailedInfo(`Config: ${JSON.stringify(configItem)}`);
                thread(configItem);
            }
        }


        let lastPriceInfo: {
            buy: number | null,
            sell: number | null
        } = {
            buy: null,
            sell: null
        }

        while (true) {
            try {
                const marketState = xeggexParser.getMarketState();

                if (!marketState.buyPrice || !marketState.sellPrice) {
                    throw new Error("Price is not available");
                }

                if (!lastPriceInfo.buy || !lastPriceInfo.sell) {

                    lastPriceInfo = {
                        buy: marketState.buyPrice,
                        sell: marketState.sellPrice
                    }

                    await updateConfig();

                    continue;
                }


                const buyPriceChangePercent = Math.abs((marketState.buyPrice - lastPriceInfo.buy) / lastPriceInfo.buy) * 100;
                const sellPriceChangePercent = Math.abs((marketState.sellPrice - lastPriceInfo.sell) / lastPriceInfo.sell) * 100;


                // logger.detailedInfo("Buy price change since last check: " + buyPriceChangePercent);
                // logger.detailedInfo("Sell price change: since last check: " + sellPriceChangePercent);
                

                if (
                    buyPriceChangePercent > env.PRICE_CHANGE_SENSITIVITY_PERCENT || 
                    sellPriceChangePercent > env.PRICE_CHANGE_SENSITIVITY_PERCENT
                ) {
                    logger.detailedInfo(`
                        Price change detected: 
                        buy ${buyPriceChangePercent.toFixed(2)}%, 
                        sell ${sellPriceChangePercent.toFixed(2)}%`
                    );

                    lastPriceInfo = {
                        buy: marketState.buyPrice,
                        sell: marketState.sellPrice
                    }
                    
                    await updateConfig();
                            

                }
            } catch (error) {
                logger.error(`Error updating config: ${error}`);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

    } else {
        for (const configItem of env.readConfig) {
            logger.detailedInfo(`Starting bot for pair ${configItem.pairId}...`);
            logger.detailedInfo(`Config: ${JSON.stringify(configItem)}`);
            thread(configItem);
        }
    }
})();

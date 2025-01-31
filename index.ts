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


const ACTIVITY_PING_INTERVAL = 15*1000;

async function thread(configItem: ConfigItemParsed) {
    const socketClient = new SocketClient();
    let socket = socketClient.initSocket();


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

    setInterval(() => {
        pingActivity();
    }, ACTIVITY_PING_INTERVAL);

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

    await sequelize.sync({ }); 

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
            !element.price.equals(configItem.price) || 
            (!elementPairid || parseInt(elementPairid, 10) !== configItem.pairId) 
            || !element.amount.equals(configItem.amount)
        ) {
            logger.detailedInfo(`Deleting saved order due to price or pair_id or amount mismatch`);
            await element.destroy();
            continue;
        }

        logger.detailedInfo(`Found saved order for pair ${configItem.pairId}...`);

    }

    for (const configItem of env.readConfig) {
        logger.detailedInfo(`Starting bot for pair ${configItem.pairId}...`);
        logger.detailedInfo(`Config: ${JSON.stringify(configItem)}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        thread(configItem);
    }
})();

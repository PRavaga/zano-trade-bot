import SocketClient from "./socket-client";
import { ZanoWallet } from "./utils/zano-wallet";
import { FetchUtils } from "./utils/fetch-methods";
import AuthParams from "./interfaces/fetch-utils/AuthParams";
import logger from "./logger";
import * as env from "./env-vars";
import { getObservedOrder, getPairData, onOrdersNotify } from "./utils/utils/utils";
import { ConfigItemParsed } from "./interfaces/common/Config";

interface AvtiveThread {
    socket: SocketClient;
    id: string;
}

const activeThreads: AvtiveThread[] = []

function destroyThreads() {
    for (const thread of activeThreads) {
        try {
            thread.socket.getSocket().disconnect();
            thread.socket.getSocket().removeAllListeners();
        } catch (error) {
            logger.error(`Failed to destroy thread ${thread.id}: ${error}`);
        }
    }

    activeThreads.length = 0;
}


const ACTIVITY_PING_INTERVAL = 15*1000;

async function thread(configItem: ConfigItemParsed) {
    const socketClient = new SocketClient();
    let socket = socketClient.initSocket();

    const socketID = socketClient.getSocket().id;

    if (!socketID) {
        throw new Error("Socket initialization failed, socket ID is not available.");
    }

    activeThreads.push({
        socket: socketClient,
        id: socketID
    });

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

    const observedOrderId = await getObservedOrder(tradeAuthToken, configItem);

    logger.detailedInfo(`Observed order id: ${observedOrderId}`);


    (async () => {
        logger.detailedInfo("Starting activity checker...");
        logger.detailedInfo(`Will ping activity checker every ${ACTIVITY_PING_INTERVAL / 1000} seconds.`);

        async function checkThreadActivity() {  
            if (!activeThreads.some(thread => thread.id === socketID)) {
                return false;
            }

            return true;
        }

        while (true) {
            try {

                const threadActive = checkThreadActivity();
                if (!threadActive) {
                    logger.info("Thread is not active, stopping activity checker...");
                    break;
                }

                await FetchUtils.pingActivityChecker(observedOrderId, tradeAuthToken)
            } catch (error) {
                console.log(error);
                logger.error(`Failed to ping activity checker: ${error}`);

                const threadActive = checkThreadActivity();
                if (!threadActive) {
                    logger.info("Thread is not active, stopping activity checker...");
                    break;
                }

                logger.info("Restarting thread in 5 seconds...");
                await new Promise(resolve => setTimeout(resolve, 5000));
                destroyThreads();

                return startBot();
            }
        
            await new Promise(resolve => setTimeout(resolve, ACTIVITY_PING_INTERVAL));
        }
    })();


    await onOrdersNotify(tradeAuthToken, observedOrderId, pairData);


    logger.detailedInfo("Subscribing to Zano Trade WS events...");

    function setSocketListeners() {
        socket.emit("in-trading", { id: configItem.pairId });

        socket.on("new-order", async () => {
            logger.info(`New order message incoming via WS, starting order notification handler...`);
            await onOrdersNotify(tradeAuthToken, observedOrderId, pairData);
        });

        socket.on("delete-order", async () => {
            logger.info(`Order deleted message incoming via WS, starting order notification handler...`);
            await onOrdersNotify(tradeAuthToken, observedOrderId, pairData);
        });

        socket.on("update-orders", async () => {
            logger.info(`Orders update message incoming via WS, starting order notification handler...`);
            await onOrdersNotify(tradeAuthToken, observedOrderId, pairData);
        });

        socket.on("disconnect", async (reason) => {
            logger.warn(`Socket disconnected: ${reason}`);
            logger.info("Restarting thread in 5 seconds...");
            await new Promise(resolve => setTimeout(resolve, 5000));
            destroyThreads();
            return startBot();
        });
    }

    setSocketListeners();

    logger.info("Bot started.");
}


async function startBot() {

    for (const configItem of env.readConfig) {
        logger.detailedInfo(`Starting bot for pair ${configItem.pairId}...`);
        logger.detailedInfo(`Config: ${JSON.stringify(configItem)}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        thread(configItem);
    }
}


startBot();
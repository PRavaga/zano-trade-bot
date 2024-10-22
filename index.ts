import socket from "./socket-client";
import { ZanoWallet } from "./utils/zano-wallet";
import { FetchUtils } from "./utils/fetch-methods";
import AuthParams from "./interfaces/fetch-utils/AuthParams";
import logger from "./logger";
import * as env from "./env-vars";

async function onOrdersNotify(authToken: string) {
    logger.detailedInfo("Started onOrdersNotify.");
    logger.detailedInfo("Fetching user orders page...");
    const response = await FetchUtils.getUserOrdersPage(authToken, env.PAIR_ID);

    logger.detailedInfo("Getting apply tips from the response...");

    const applyTips = response?.data?.applyTips;

    if (!applyTips || !(applyTips instanceof Array)) {
        throw new Error("Error: error while request or applyTips is not array or not contained in response");
    }

    logger.detailedInfo("Processing apply tips...");
    logger.detailedInfo(applyTips);

    // ...

    logger.detailedInfo("onOrdersNotify finished.");
}

(async () => {
    logger.detailedInfo("Starting bot...");
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

    if (!authRes.success) {
        throw new Error(`Zano Trade auth request is successful, but auth failed: ${authRes.message}`);
    } else {
        tradeAuthToken = authRes.data;
    }

    logger.detailedInfo("Authentication successful.");

    logger.detailedInfo("Subscribing to Zano Trade WS events...");


    await onOrdersNotify(tradeAuthToken);

    socket.emit("in-trading", { id: env.PAIR_ID });

    socket.on("new-order", async (data) => {
        logger.info(`New order incoming via WS:`);
        logger.info(data);
        await onOrdersNotify(tradeAuthToken);
    });

    logger.info("Bot started.");
})();

process.on('exit', () => {
    socket.emit("out-trading", { id: env.PAIR_ID }); 
});

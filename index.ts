import socket from "./socket-client";
import { ZanoWallet } from "./utils/zano-wallet";
import { FetchUtils } from "./utils/fetch-methods";
import AuthParams from "./interfaces/fetch-utils/AuthParams";
import logger from "./logger";
import * as env from "./env-vars";
import { getObservedOrder, onOrdersNotify } from "./utils/utils/utils";


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

    if (!authRes?.success) {
        throw new Error(`Zano Trade auth request is successful, but auth failed: ${authRes.message}`);
    } else {
        tradeAuthToken = authRes.data;
    }

    logger.detailedInfo("Authentication successful.");
    logger.detailedInfo("Getting observed order...");

    const observedOrderId = await getObservedOrder(tradeAuthToken);

    logger.detailedInfo(`Observed order  id: ${observedOrderId}`);

    await onOrdersNotify(tradeAuthToken, observedOrderId);


    logger.detailedInfo("Subscribing to Zano Trade WS events...");

    socket.emit("in-trading", { id: env.PAIR_ID });

    socket.on("new-order", async (data) => {
        logger.info(`New order incoming via WS:`);
        logger.info(data);
        await onOrdersNotify(tradeAuthToken, observedOrderId);
    });

    logger.info("Bot started.");
})();

process.on('exit', () => {
    socket.emit("out-trading", { id: env.PAIR_ID }); 
});

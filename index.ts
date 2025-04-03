import * as env from "./env-vars";

import logger from "./logger";
import { auth, flushOrders, getObservedOrder, getPairData, onOrdersNotify, prepareThreadSocket, startActivityChecker, startThreadsFromConfig, syncDatabaseWithConfig, threadRestartChecker } from "./utils/utils";
import { ConfigItemParsed } from "./interfaces/common/Config";
import sequelize from "./database/database";
import { addActiveThread, state } from "./utils/states";
import { NotificationParams } from "./interfaces/common/Common";
import { destroyThread } from "./utils/utils";
import ParserHandler from "./utils/dex_parsers/parserHandler";

export async function thread(configItem: ConfigItemParsed) {

    // connect socket
    const { socketClient, activeThreadData } = await prepareThreadSocket();
    addActiveThread(activeThreadData)

    logger.info(`Starting thread with id ${activeThreadData.id}...`);

    // auth and create/find order
    const { tradeAuthToken } = await auth();

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



    // continuously ping trade server and check for disconnects
    startActivityChecker(activeThreadData, observedOrderId, tradeAuthToken);
    threadRestartChecker(activeThreadData, () => {
        thread(configItem);
    });


    // get pair data
    logger.detailedInfo("Fetching trading pair data...");
    const pairData = await getPairData(configItem.pairId);
    const notificationParams: NotificationParams = [tradeAuthToken, observedOrderId, pairData, configItem.trade_id];




    // initial check for matches and set WS listeners
    await onOrdersNotify(...notificationParams);
    await socketClient.setSocketListeners(
        configItem,
        notificationParams,
        activeThreadData
    );

    logger.info("Bot started.");
}

async function startWithParser() {
    
    const parserHandler = new ParserHandler({
        type: env.PARSER_TYPE
    });

    await parserHandler.init();


    async function updateConfig() {

        logger.detailedInfo("Destroying threads...");

        const cachedActiveThreads = JSON.parse(JSON.stringify(state.activeThreads.map(e => ({
            id: e.id
        }))));

        for (const thread of cachedActiveThreads) {
            logger.warn(`Destroying thread ${thread.id}...`);
            destroyThread(thread.id);
        }
        
        logger.info("All threads destroyed!");
        

        const marketState = parserHandler.getMarketState();
        const preparedConfig = parserHandler.getConfigWithLivePrice(marketState);

        const { tradeAuthToken } = await auth();

        for (const element of preparedConfig) {
            await flushOrders(element.pairId, tradeAuthToken);
        }
        
        console.log(marketState);

        await startThreadsFromConfig(preparedConfig);
    }

    parserHandler.setPriceChangeListener(updateConfig);
}

(async () => {

    await sequelize.sync({});
    logger.detailedInfo("Database synced!");

    await syncDatabaseWithConfig();

    if (env.PARSER_ENABLED) {
        await startWithParser();
    } else {
        await startThreadsFromConfig(env.readConfig);
    }

})();
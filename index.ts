import * as env from "./env-vars";

import logger from "./logger";
import { auth, flushOrdersForConfigItem, getConfigItemID, getObservedOrder, getPairData, onOrdersNotify, prepareDatabaseStructure, prepareThreadSocket, startActivityChecker, startThreadsFromConfig, syncDatabaseWithConfig, threadRestartChecker } from "./utils/utils";
import { ConfigItemParsed } from "./interfaces/common/Config";
import sequelize from "./database/database";
import { addActiveThread, state } from "./utils/states";
import { NotificationParams } from "./interfaces/common/Common";
import { destroyThread } from "./utils/utils";
import ParserHandler from "./utils/dex_parsers/parserHandler";
import telegramHandler from "./utils/telegramHandler";
import { get } from "http";
import { Decimal } from "decimal.js";

export async function thread(configItem: ConfigItemParsed) {

    // connect socket
    const { socketClient, activeThreadData } = await prepareThreadSocket();

    const preparedThreadData = {
        ...activeThreadData,
        threadID: getConfigItemID(configItem)
    };

    console.log(configItem, getConfigItemID(configItem));
    

    addActiveThread(preparedThreadData)

    logger.info(`Starting thread with id ${preparedThreadData.id}...`);

    // auth and create/find order
    const { tradeAuthToken } = await auth();
    await flushOrdersForConfigItem(tradeAuthToken, configItem).catch(e => console.log(e));

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
    startActivityChecker(preparedThreadData, observedOrderId, tradeAuthToken);
    threadRestartChecker(preparedThreadData, () => {
        thread(configItem);
    });


    // get pair data
    logger.detailedInfo("Fetching trading pair data...");
    const pairData = await getPairData(configItem.pairId);
    const notificationParams: NotificationParams = [
        tradeAuthToken, observedOrderId, pairData, configItem.trade_id,
        configItem
    ];




    // initial check for matches and set WS listeners
    await onOrdersNotify(...notificationParams);
    await socketClient.setSocketListeners(
        configItem,
        notificationParams,
        preparedThreadData
    );

    logger.info("Bot started.");
}

async function startWithParser(configItem: ConfigItemParsed) {

    if (!configItem.parser_config) {
        throw new Error("Parser config is missing in parser start (unexpected).");
    }

    const parserHandler = new ParserHandler({
        config: configItem.parser_config
    });

    await parserHandler.init();

    const marketState = parserHandler.getMarketState();
    parserHandler.getConfigWithLivePrice(marketState, configItem);

    async function updateConfig() {
        try {
            logger.detailedInfo("Destroying threads...");

            const cachedActiveThreads = JSON.parse(JSON.stringify(state.activeThreads.map(e => ({
                id: e.id,
                threadID: e.threadID
            })))).filter((e: { threadID: string }) => e.threadID === getConfigItemID(configItem));

            console.log(state.activeThreads);
            console.log('targetID:', configItem, getConfigItemID(configItem));
            
            

            for (const thread of cachedActiveThreads) {
                logger.warn(`Destroying thread ${thread.id}...`);
                destroyThread(thread.id);
            }

            logger.info("All threads destroyed!");


            const marketState = parserHandler.getMarketState();
            const preparedConfig = parserHandler.getConfigWithLivePrice(marketState, configItem);

            if (!preparedConfig) {
                logger.error("Prepared config is false, not starting threads.");
                return;
            }

            const { tradeAuthToken } = await auth();

            await flushOrdersForConfigItem(tradeAuthToken, configItem);

            await startThreadsFromConfig([preparedConfig]);
        } catch (error) {
            console.log(error);
        }
    }

    parserHandler.setPriceChangeListener(updateConfig, configItem);
}

(async () => {

    await sequelize.sync({});
    await prepareDatabaseStructure();
    await syncDatabaseWithConfig();
    logger.detailedInfo("Database synced!");

    if (env.TELEGRAM_BOT_TOKEN) {
        await telegramHandler.init();
    }

    const configWithParser = env.readConfig.filter(e => e.parser_config).map(e => {
        return {
            ...e,
            price: new Decimal(2**53 - 1) // initial price will be replaced by parser
            // set a huge price to avoid accidental execution in case of bugs
        }
    });
    const configWithoutParser = env.readConfig.filter(e => !e.parser_config)

    if (configWithoutParser.length > 0) {
        await startThreadsFromConfig(configWithoutParser);
    }

    for (const element of configWithParser) {
        startWithParser(element);
    }

})();
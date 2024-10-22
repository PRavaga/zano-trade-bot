import Decimal from "decimal.js";
import logger from "../../logger";
import { FetchUtils } from "../fetch-methods";
import * as env from "./../../env-vars";

export async function onOrdersNotify(authToken: string, observedOrder: any) {
    logger.detailedInfo("Started onOrdersNotify.");
    logger.detailedInfo("Fetching user orders page...");
    const response = await FetchUtils.getUserOrdersPage(authToken, env.PAIR_ID);

    logger.detailedInfo("Getting apply tips from the response...");

    const applyTips = response?.data?.applyTips;

    if (!applyTips || !(applyTips instanceof Array)) {
        throw new Error("Error: error while request or applyTips is not array or not contained in response");
    }

    logger.detailedInfo("Processing apply tips...");
    // logger.detailedInfo(applyTips);

    // ...

    logger.detailedInfo("onOrdersNotify finished.");
}

export async function getObservedOrder(authToken: string) {
    logger.detailedInfo("Started getObservedOrder.");

    async function fetchMatchedOrder() {
        logger.detailedInfo("Fetching user orders page...");
        const response = await FetchUtils.getUserOrdersPage(authToken, env.PAIR_ID);

        const orders = response?.data?.orders;
    
        if (!orders || !(orders instanceof Array)) {
            throw new Error("Error: error while request or orders is not array or not contained in response");
        }

        logger.detailedInfo("Processing orders...");

        const existingOrder = orders.find(e => {
            const isMatch = !!(
                new Decimal(e.amount).equals(env.AMOUNT) &&
                new Decimal(e.left).equals(env.AMOUNT) &&
                new Decimal(e.price).equals(env.PRICE) &&
                e.type === env.TYPE
            );

            return isMatch;
        });

        return existingOrder;
    }


    const existingOrder = await fetchMatchedOrder();
    
    if (existingOrder) {
        logger.detailedInfo("Found existing order.");
        logger.detailedInfo("getObservedOrder finished.");
        return existingOrder;
    }

    logger.detailedInfo("Existing order not found.");
    logger.detailedInfo("Creating new order...");

    const createRes = await FetchUtils.createOrder(
        authToken,
        {
            pairId: env.PAIR_ID,
            type: env.TYPE,
            amount: env.AMOUNT.toFixed(),
            price: env.PRICE.toFixed(),
            side: "limit"
        }
    );

    if (!createRes?.success) {
        throw new Error("Error: order creation request responded with an error: " + createRes.data);
    }

    logger.detailedInfo("Order created.");
    logger.detailedInfo("Getting newly created order...");

    const matchedOrder = await fetchMatchedOrder();
    
    if (!matchedOrder) {
        throw new Error("Error: newly created order not found.");
    }

    
    logger.detailedInfo("getObservedOrder finished.");
    return matchedOrder;
}
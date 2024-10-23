import Decimal from "decimal.js";
import logger from "../../logger";
import { FetchUtils } from "../fetch-methods";
import * as env from "./../../env-vars";
import PairData from "../../interfaces/common/PairData";
import { ZanoWallet } from "../zano-wallet";


export const ordersToIgnore = [] as number[];

async function _onOrdersNotify(authToken: string, observedOrderId: number, pairData: PairData) {
    logger.detailedInfo("Started onOrdersNotify.");
    logger.detailedInfo("Fetching user orders page...");
    const response = await FetchUtils.getUserOrdersPage(authToken, env.PAIR_ID);

    logger.detailedInfo("Getting new observed order state from the response...");

    const orders = response?.data?.orders;

    if (!orders || !(orders instanceof Array)) {
        throw new Error("Error: error while request or orders is not array or not contained in response");
    }

    logger.detailedInfo("Processing orders...");

    const newObservedOrder = orders.find(e => e.id === observedOrderId);

    if (!newObservedOrder || new Decimal(newObservedOrder.left).lessThanOrEqualTo(0)) {
        logger.info("Observed order has been finished or canceled.");
        process.exit(0);
    }

    logger.detailedInfo("Getting apply tips from the response...");

    const applyTips = response?.data?.applyTips;

    if (!applyTips || !(applyTips instanceof Array)) {
        throw new Error("Error: error while request or applyTips is not array or not contained in response");
    }

    logger.detailedInfo("Processing apply tips...");

    const matchedApplyTipArray = applyTips.filter(e => {
        const tipMatches =
            (newObservedOrder.type === "buy"
                ? new Decimal(newObservedOrder.price).greaterThanOrEqualTo(e.price)
                : new Decimal(newObservedOrder.price).lessThanOrEqualTo(e.price)
            );

        return tipMatches;
    });

    const matchedApplyTip = matchedApplyTipArray
        .filter(e => !ordersToIgnore.includes(e.id))
        .reduce((prev, current) => {
        if (newObservedOrder.type === "buy") {
            if (prev?.price && new Decimal(prev?.price).lessThanOrEqualTo(current.price)) {
                return prev;
            }
        } else {
            if (prev?.price && new Decimal(prev?.price).greaterThanOrEqualTo(current.price)) {
                return prev;
            }
        }

        return current;
    }, null);
    
    if (!matchedApplyTip) {
        logger.detailedInfo("Apply tips for observed order are not found.");
        logger.detailedInfo("onOrdersNotify finished.");
        return;
    }

    logger.detailedInfo("Found matching apply tip:");
    logger.detailedInfo(matchedApplyTip);
    logger.detailedInfo("Applying order...");

    if (matchedApplyTip.transaction) {
        if (!matchedApplyTip.hex_raw_proposal) {
            throw new Error("Invalid transaction data received");
        }

        const result = await FetchUtils.confirmTransaction(matchedApplyTip.id, authToken);

        if (!result.success) {
            throw new Error("Failed to confirm transaction");
        }
    } else {
        const firstCurrencyId = pairData?.first_currency.asset_id;
        const secondCurrencyId = pairData?.second_currency.asset_id;

        if (!(firstCurrencyId && secondCurrencyId)) {
            throw new Error("Invalid transaction data received");
        }

        const leftDecimal = new Decimal(matchedApplyTip.left);
        const priceDecimal = new Decimal(matchedApplyTip.price);

        const targetAmount = leftDecimal.greaterThanOrEqualTo(newObservedOrder.left) ? 
            new Decimal(newObservedOrder.left) : leftDecimal;

        const params = {
            destinationAssetID: matchedApplyTip.type === "buy" ? secondCurrencyId : firstCurrencyId,
            destinationAssetAmount:
                notationToString(
                    matchedApplyTip.type === "buy" ?
                        targetAmount.mul(priceDecimal).toString() :
                        targetAmount.toString()
                ),
            currentAssetID: matchedApplyTip.type === "buy" ? firstCurrencyId : secondCurrencyId,
            currentAssetAmount:
                notationToString(matchedApplyTip.type === "buy" ?
                    targetAmount.toString() :
                    targetAmount.mul(priceDecimal).toString()
                ),

            destinationAddress: matchedApplyTip.user.address
        };

        logger.detailedInfo(params);

        const hex = await ZanoWallet.ionicSwap(params).catch(err => {
            if (err.toString().includes("Insufficient funds")) {
                return "Insufficient funds"
            } else {
                throw err;
            }
        });

        if (hex === "Insufficient funds") {
            logger.detailedInfo("Opponent has insufficient funds, skipping this apply tip.");
            ordersToIgnore.push(matchedApplyTip.id);

            logger.detailedInfo("Calling onOrdersNotify again in 5 sec, to check there are any more apply tips...");
            await new Promise(resolve => setTimeout(resolve, 5000));

            return _onOrdersNotify.apply(this, arguments);
        }

        const result = await FetchUtils.applyOrder(
            {
                ...matchedApplyTip,
                hex_raw_proposal: hex
            },
            authToken
        );

        if (!result?.success) {
            throw new Error("Apply order request responded with an error");
        }

        logger.detailedInfo("Calling onOrdersNotify again in 5 sec, to check there are any more apply tips...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        return _onOrdersNotify.apply(this, arguments);
    }

    logger.detailedInfo("Order applied successfully.");
    logger.detailedInfo("onOrdersNotify finished.");
}

export async function onOrdersNotify(authToken: string, observedOrderId: number, pairData: PairData) {
    try {
        return await _onOrdersNotify(authToken, observedOrderId, pairData);
    } catch (err) {
        logger.info("Order notification handler failed with error, waiting for new notifications:");
        logger.info(err);
    }
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
        return existingOrder.id as number;
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
    return matchedOrder.id as number;
}

export async function getPairData(id: number) {
    logger.detailedInfo("Started getPairData.");

    const response = await FetchUtils.getPair(id);

    const pairData = response?.data;

    if (!response?.success || !pairData || typeof pairData !== "object") {
        throw new Error("Error: error while request or pair data is not contained in response");
    }

    return pairData;
}

export const addZeros = (amount: number | string, decimal_point: number = 12) => {
    const multiplier = new Decimal(10).pow(decimal_point);
    const bigAmount = new Decimal(amount);
    const fixedAmount = bigAmount.times(multiplier);
    return fixedAmount;
};


export const notationToString = (notation: number | string) => {
    const decimalValue = new Decimal(notation || "0");

    const fixedValue = decimalValue.toFixed();

    // Remove trailing zeros
    return fixedValue;
}
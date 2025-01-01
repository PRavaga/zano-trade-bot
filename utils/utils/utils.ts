import Decimal from "decimal.js";
import logger from "../../logger";
import { FetchUtils } from "../fetch-methods";
import * as env from "./../../env-vars";
import PairData from "../../interfaces/common/PairData";
import { ZanoWallet } from "../zano-wallet";
import { ConfigItemParsed } from "../../interfaces/common/Config";


export const ordersToIgnore = [] as number[];

interface TxData {
    destinationAssetID: string;
    destinationAssetAmount: string;
    currentAssetID: string;
    currentAssetAmount: string;
}

async function _processTransaction(hex: string, txId: number, authToken: string, txData: TxData) {
    if (!hex) {
        throw new Error("Invalid transaction data received");
    }

    const info = await ZanoWallet.getSwapInfo(hex);

    const receivingAssetData = info.proposal.to_finalizer.find(e => e.asset_id === txData.destinationAssetID);
    const sendingAssetData = info.proposal.to_initiator.find(e => e.asset_id === txData.currentAssetID);


    if (!receivingAssetData || !sendingAssetData) {
        throw new Error([
            `Invalid transaction data received.`,
            `Data from hex: ${JSON.stringify(info)}`,
            `Data from trade website: ${JSON.stringify(txData)}`
        ].join(" "));
    }

    const zanodReceivingData = await ZanoWallet.getAsset(receivingAssetData.asset_id);
    const zanodSendingData = await ZanoWallet.getAsset(sendingAssetData.asset_id);

    if (!zanodReceivingData || !zanodSendingData) {
        throw new Error("One or both assets not found");
    }

    const txDataReceivingAmount = addZeros(txData.destinationAssetAmount, zanodReceivingData.decimal_point);
    const txDataSendingAmount = addZeros(txData.currentAssetAmount, zanodSendingData.decimal_point);

    if (txDataReceivingAmount?.toString() !== receivingAssetData.amount?.toString()) {
        throw new Error([
            `Receiving asset amount mismatch.`,
            `Hex amount: ${receivingAssetData.amount}`,
            `Trade website amount: ${txDataReceivingAmount}`
        ].join(" "));
    }

    if (txDataSendingAmount?.toString() !== sendingAssetData.amount?.toString()) {
        throw new Error([
            `Sending asset amount mismatch.`,
            `Hex amount: ${sendingAssetData.amount}`,
            `Trade website amount: ${txDataSendingAmount}`
        ].join(" "));
    }

    logger.detailedInfo("Tx validated successfully.");


    const swapResult = await ZanoWallet.ionicSwapAccept(hex).catch(err => {
        if (err.toString().includes("Insufficient funds")) {
            return "insufficient_funds"
        } else {
            throw err;
        }
    });

    
    if (swapResult === "insufficient_funds") {
        logger.detailedInfo("Opponent has insufficient funds, skipping this apply tip.");
        ordersToIgnore.push(txId);

        logger.detailedInfo("Calling onOrdersNotify again in 5 sec, to check there are any more apply tips...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        return _onOrdersNotify.apply(this, arguments);
    }

    const result = await FetchUtils.confirmTransaction(txId, authToken);

    if (!result.success) {
        throw new Error("Failed to confirm transaction");
    }
}

async function _onOrdersNotify(authToken: string, observedOrderId: number, pairData: PairData) {
    logger.detailedInfo("Started    onOrdersNotify.");
    logger.detailedInfo("Fetching user orders page...");
    const response = await FetchUtils.getUserOrdersPage(authToken, parseInt(pairData.id, 10));

    logger.detailedInfo("Getting new observed order state from the response...");

    const orders = response?.data?.orders;

    if (!orders || !(orders instanceof Array)) {
        throw new Error("Error: error while request or orders is not array or not contained in response");
    }

    logger.detailedInfo("Processing orders...");

    const newObservedOrder = orders.find(e => e.id === observedOrderId);

    if (!newObservedOrder || new Decimal(newObservedOrder.left).lessThanOrEqualTo(0)) {
        logger.info("Observed order has been finished or canceled.");
        logger.detailedInfo(newObservedOrder);
        // process.exit(0);
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

    const leftDecimal = new Decimal(matchedApplyTip.left);
    const priceDecimal = new Decimal(matchedApplyTip.price);

    const targetAmount = leftDecimal.greaterThanOrEqualTo(newObservedOrder.left) ? 
        new Decimal(newObservedOrder.left) : leftDecimal;

    const destinationAssetAmount = notationToString(
        matchedApplyTip.type === "buy" ?
            targetAmount.mul(priceDecimal).toString() :
            targetAmount.toString()
    );

    const currentAssetAmount = notationToString(matchedApplyTip.type === "buy" ?
        targetAmount.toString() :
        targetAmount.mul(priceDecimal).toString()
    )

    const firstCurrencyId = pairData?.first_currency.asset_id;
    const secondCurrencyId = pairData?.second_currency.asset_id;

    if (!(firstCurrencyId && secondCurrencyId)) {
        throw new Error("Invalid transaction data received");
    }

    const destinationAssetID = matchedApplyTip.type === "buy" ? secondCurrencyId : firstCurrencyId;
    const currentAssetID = matchedApplyTip.type === "buy" ? firstCurrencyId : secondCurrencyId;

    const txData = {
        destinationAssetID: destinationAssetID,
        destinationAssetAmount: destinationAssetAmount,
        currentAssetID: currentAssetID,
        currentAssetAmount: currentAssetAmount
    };

    if (matchedApplyTip.transaction) {
        await _processTransaction(matchedApplyTip.hex_raw_proposal, matchedApplyTip.id, authToken, txData);
    } else {

        // return logger.detailedInfo("IGNORING INITIATING SWAP {DEBUGGING}");
        

        const params = {
            destinationAssetID: destinationAssetID,
            destinationAssetAmount: destinationAssetAmount,
            currentAssetID: currentAssetID,
            currentAssetAmount: currentAssetAmount,
            destinationAddress: matchedApplyTip.user.address
        };

        logger.detailedInfo(params);

        const hex = await ZanoWallet.ionicSwap(params).catch(err => {
            if (err.toString().includes("Insufficient funds")) {
                return "insufficient_funds"
            } else {
                throw err;
            }
        });

        if (hex === "insufficient_funds") {
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
            if (result.data === "Invalid order data") {
                logger.detailedInfo("Probably the order is already applied, fetching the probable application data...");
                
                let activeTxRes: any;
                try {
                    activeTxRes = await FetchUtils.getActiveTxByOrdersIds(1, 2, "test");
                } catch (err) {
                    if (err.code === "ERR_BAD_REQUEST") {
                        activeTxRes = err.response.data;
                    } else {
                        throw err;
                    }
                }
                logger.detailedInfo(activeTxRes);
                

                if (activeTxRes?.success && activeTxRes?.data) {
                    logger.detailedInfo("The order is already applied. The active transaction is:");
                    logger.detailedInfo(activeTxRes);
                    logger.detailedInfo("Finalizing the transaction...");

                    const activeTx = activeTxRes.data;
                    await _processTransaction(activeTx.hex_raw_proposal, activeTx.id, authToken, txData);
                } else {
                    logger.detailedInfo("The order is not applied, skipping this apply tip.");
                    ordersToIgnore.push(matchedApplyTip.id);
                }
            } else {
                throw new Error("Apply order request responded with an error");
            }
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

export async function getObservedOrder(authToken: string, configItem: ConfigItemParsed) {
    logger.detailedInfo("Started getObservedOrder.");

    async function fetchMatchedOrder() {
        logger.detailedInfo("Fetching user orders page...");
        const response = await FetchUtils.getUserOrdersPage(authToken, configItem.pairId);

        const orders = response?.data?.orders;

        if (!orders || !(orders instanceof Array)) {
            throw new Error("Error: error while request or orders is not array or not contained in response");
        }

        logger.detailedInfo("Processing orders...");

        const existingOrder = orders.find(e => {
            const isMatch = !!(
                new Decimal(e.amount).equals(configItem.amount) &&
                new Decimal(e.left).equals(configItem.amount) &&
                new Decimal(e.price).equals(configItem.price) &&
                e.type === configItem.type
            );

            return isMatch;
        });

        return existingOrder;
    }

    if (env.DELETE_ON_START) {
        const existingOrdersList = await FetchUtils.getUserOrdersPage(authToken, configItem.pairId);
        const existingOrders = existingOrdersList?.data?.orders || [];
        
        for (const existingOrder of existingOrders) {
            if (new Decimal(existingOrder.price).equals(configItem.price) && existingOrder.type === configItem.type) {
                logger.detailedInfo("Deleting existing order with same price...");
                await FetchUtils.deleteOrder(authToken, existingOrder.id);
    
            }
        }
       
    }


    if (!env.DELETE_ON_START) {
        const existingOrder = await fetchMatchedOrder();

        if (existingOrder) {
            logger.detailedInfo("Found existing order.");
            logger.detailedInfo("getObservedOrder finished.");
            return existingOrder.id as number;
        }
    
        logger.detailedInfo("Existing order not found.");
    }

    logger.detailedInfo("Creating new order...");


    const createRes = await FetchUtils.createOrder(
        authToken,
        {
            pairId: configItem.pairId,
            type: configItem.type,
            amount: configItem.amount.toFixed(),
            price: configItem.price.toFixed(),
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
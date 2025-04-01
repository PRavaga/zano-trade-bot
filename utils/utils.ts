import Decimal from "decimal.js";
import logger from "../logger";
import { FetchUtils } from "./fetchMethods";
import * as env from "../env-vars";
import PairData from "../interfaces/common/PairData";
import { ZanoWallet } from "./zanoWallet";
import { ConfigItemParsed, ConfigParsed } from "../interfaces/common/Config";
import Order from "../schemes/Order";
import { ActiveThread } from "../interfaces/common/State";
import { deleteActiveThread, queueThreadToRestart, state } from "./states";
import SocketClient from "./socket";
import AuthParams from "../interfaces/fetch-utils/AuthParams";
import { thread } from "..";

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

		return;
	}

	const result = await FetchUtils.confirmTransaction(txId, authToken);

	if (!result.success) {
		throw new Error("Failed to confirm transaction");
	}

	return true;
}

async function _onOrdersNotify(authToken: string, observedOrderId: number, pairData: PairData, trade_id: string | null) {
	logger.detailedInfo("Started    onOrdersNotify.");
	logger.detailedInfo("Fetching user orders page...");
	const response = await FetchUtils.getUserOrdersPage(authToken, parseInt(pairData.id, 10));

	logger.detailedInfo("Getting new observed order state from the response...");

	const orders = response?.data?.orders;

	if (!orders || !(orders instanceof Array)) {
		throw new Error("Error: error while request or orders is not array or not contained in response");
	}

	logger.detailedInfo(`Processing orders (observedOrderId: ${observedOrderId})...`);

	const newObservedOrder = orders.find(e => e.id === observedOrderId);

	if (!newObservedOrder || new Decimal(newObservedOrder.left).lessThanOrEqualTo(0)) {
		logger.info("Observed order has been finished or canceled.");
		logger.detailedInfo(newObservedOrder);
		// process.exit(0);
		return;
	}

	logger.detailedInfo("Getting apply tips from the response...");

	const savedOrder = await Order.findOne({
		where: {
			trade_id: trade_id
		}
	});

	const applyTips = response?.data?.applyTips.filter(e => {
		if (!savedOrder) {
			return true;
		}

		return !savedOrder?.appliedTo.includes(e.id);
	});

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
		.reduce((prev: any, current) => {
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

	async function saveAppliedId(id: number) {

		logger.detailedInfo("Updating order applies...");


		if (trade_id) {

			const prevOrder = await Order.findOne({
				where: {
					trade_id: trade_id,
				}
			});

			if (!prevOrder) {
				throw new Error("Order not found in the database");
			}

			await Order.update(
				{
					appliedTo: [...prevOrder?.appliedTo, parseInt(matchedApplyTip.id?.toString(), 10)]
				},
				{
					where: {
						trade_id: trade_id
					}
				}
			);

			logger.detailedInfo("Order applies updated successfully.");
		}
	}

	if (matchedApplyTip.transaction) {
		logger.debug("tx data");
		logger.debug(txData);
		const success = await _processTransaction(matchedApplyTip.hex_raw_proposal, matchedApplyTip.id, authToken, txData);
		if (success) {
			await saveAppliedId(matchedApplyTip.id);
		}
		return _onOrdersNotify.apply(this, arguments);
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
					const processSuccess = await _processTransaction(activeTx.hex_raw_proposal, activeTx.id, authToken, txData);

					if (processSuccess) {
						await saveAppliedId(matchedApplyTip.id);
					}

				} else {
					logger.detailedInfo("The order is not applied, skipping this apply tip.");
					ordersToIgnore.push(matchedApplyTip.id);
				}
			} else {
				throw new Error("Apply order request responded with an error");
			}
		} else {
			await saveAppliedId(matchedApplyTip.id);
		}

		logger.detailedInfo("Calling onOrdersNotify again in 5 sec, to check there are any more apply tips...");
		await new Promise(resolve => setTimeout(resolve, 5000));
		return _onOrdersNotify.apply(this, arguments);
	}
}

export async function saveOrderinfo(authToken: string, observedOrderId: number, pairData: PairData, trade_id: string | null) {

	if (!trade_id) {
		return;
	}

	const response = await FetchUtils.getUserOrdersPage(authToken, parseInt(pairData.id, 10));

	logger.detailedInfo("Saving order Info...");

	const orders = response?.data?.orders;

	if (!orders || !(orders instanceof Array)) {
		throw new Error("Error: error while request or orders is not array or not contained in response");
	}

	logger.detailedInfo("Updating remaining amount...");

	const newObservedOrder = orders.find(e => e.id === observedOrderId);

	logger.detailedInfo(`New Remaining amount: ${newObservedOrder?.left || ("0 *order complited*")} for trade_id: ${trade_id}`);
	console.log('newObservedOrder', newObservedOrder);


	await Order.update({
		remaining: newObservedOrder?.left || 0
	}, {
		where: {
			trade_id: trade_id
		}
	});

	logger.detailedInfo(`Order info saved. Remaining amount: ${newObservedOrder?.left} for trade_id: ${trade_id}`);
}

export async function onOrdersNotify(authToken: string, observedOrderId: number, pairData: PairData, trade_id: string | null) {
	try {
		return await _onOrdersNotify(authToken, observedOrderId, pairData, trade_id).then(async res => {
			await saveOrderinfo(authToken, observedOrderId, pairData, trade_id).catch(err => {
				logger.info("Order info saving failed with error, waiting for new notifications:");
				logger.info(err);
			});
			return res;
		})
	} catch (err) {
		logger.info("Order notification handler failed with error, waiting for new notifications:");
		logger.info(err);
	}
}

export async function getObservedOrder(authToken: string, configItem: ConfigItemParsed) {
	logger.detailedInfo("Started getObservedOrder.");

	const savedOrder = await Order.findOne({
		where: {
			trade_id: configItem.trade_id
		}
	});


	logger.detailedInfo('saved order:', savedOrder);



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
				(new Decimal(e.amount).equals(configItem.amount) || savedOrder?.remaining?.equals(new Decimal(e.amount))) &&
				new Decimal(e.price).equals(configItem.price) &&
				e.type === configItem.type &&
				(
					(!savedOrder && new Decimal(e.left).equals(configItem.amount))
					||
					(savedOrder && savedOrder?.remaining.equals(e.left))
				)
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

	const creationParams = {
		pairId: configItem.pairId,
		type: configItem.type,
		amount: savedOrder?.remaining?.toFixed() || configItem.amount.toFixed(),
		price: configItem.price.toFixed(),
		side: "limit" as const
	};

	logger.detailedInfo("Creating new order...");
	logger.detailedInfo(creationParams);


	if (savedOrder?.remaining && savedOrder.remaining.lte(0)) {
		throw new Error("Error: remaining amount is less than or equal to 0.");
	}

	const createRes = await FetchUtils.createOrder(
		authToken,
		creationParams
	);

	if (!createRes?.success) {
		throw new Error("Error: order creation request responded with an error: " + createRes.data);
	}

	if (!savedOrder) {
		await Order.create({
			pair_url: env.CUSTOM_SERVER + "/dex/trading/" + configItem.pairId.toString(),
			amount: configItem.amount.toFixed(),
			price: configItem.price.toFixed(),
			type: configItem.type,
			remaining: configItem.amount.toFixed(),
			trade_id: configItem.trade_id
		});
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

	return pairData as PairData;
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

export const startActivityChecker = (currentThread: ActiveThread, observedOrderId: number, tradeAuthToken: string) => {
	// funtion supposed to be async, we shouldn't wait for this loop
	(async () => {
		logger.detailedInfo("Starting activity checker...");
		logger.detailedInfo(`Will ping activity checker every ${env.ACTIVITY_PING_INTERVAL / 1000} seconds.`);

		async function checkThreadActivity() {
			if (!state.activeThreads.some(thread => thread.id === currentThread.id)) {
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
				queueThreadToRestart(currentThread);
				break;
			}

			await new Promise(resolve => setTimeout(resolve, env.ACTIVITY_PING_INTERVAL));
		}
	})();
}

export const prepareThreadSocket = async () => {
	const socketClient = new SocketClient();
	let socket = await socketClient.initSocket();

	const socketID = socketClient.getSocket().id;

	if (!socketID) {
		throw new Error("Socket initialization failed, socket ID is not available.");
	}

	const activeThreadData = {
		socket: socketClient,
		id: socketID
	};

	return {
		socket,
		socketClient,
		activeThreadData
	}
}

export const auth = async () => {
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

	return {
		tradeAuthToken
	}
}
export function destroyThread(id: string) {
    const thread = state.activeThreads.find(thread => thread.id === id);

    if (thread) {
        try {
            thread.socket.getSocket().disconnect();
            thread.socket.getSocket().removeAllListeners();
        } catch (error) {
            logger.error(`Failed to destroy thread ${thread.id}: ${error}`);
        }

        deleteActiveThread(thread);
        logger.info(`Thread ${thread.id} destroyed`);
    } else {
        logger.error(`Thread with id ${id} not found`);
    }
}


export async function threadRestartChecker(currentThread: ActiveThread, threadFunction: any) {
	// function supposed to be async, we shouldn't wait for this loop
	(async () => {
		while (true) {
			try {
				const shouldRestart = state.threadsToRestart.find(thread => thread.id === currentThread.id);
				if (shouldRestart) {
					logger.info(`Thread ${currentThread.id} is marked for restart. Restarting...`);
					destroyThread(currentThread.id);
					threadFunction();
					break;
				}

				const isStillActive = state.activeThreads.find(thread => thread.id === currentThread.id);
				if (!isStillActive) {
					logger.info(`Thread ${currentThread.id} is no longer active. Stopping restart checker...`);
					break;
				}

			} catch (error) {
				logger.error(`Failed to check thread restart status: ${error}`);
			}

			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	})();
}


export async function syncDatabaseWithConfig() {
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
}

export async function startThreadsFromConfig(config: ConfigParsed) {
    for (const configItem of config) {
        logger.detailedInfo(`Starting bot for pair ${configItem.pairId}...`);
        logger.detailedInfo(`Config: ${JSON.stringify(configItem)}`);
        thread(configItem);
    }
}

export function toFixedDecimalNumber(value: number | string, decimalPlaces: number = 12) {
	return parseFloat(new Decimal(value).toFixed(decimalPlaces));
}
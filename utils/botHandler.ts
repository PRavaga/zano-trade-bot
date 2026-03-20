import logger from "../logger";
import { FetchUtils } from "./fetchMethods";
import SocketClient from "./socket";
import { ZanoWallet } from "./zanoWallet";

class BotHandler {

    private token: string | null = null;
    private socketClient: SocketClient | null = null;

    async init() {
        await this.auth();

    }

    async auth() {
        const walletInfo = await ZanoWallet.getWalletInfo();

        if (!walletInfo.alias) {
            throw new Error("Unable to authenticate: wallet doesn't have alias");
        }

        const nonceRes = (await FetchUtils.getAuthNonce(walletInfo.address, walletInfo.alias))?.data;

        if (!nonceRes) {
            throw new Error("Unable to authenticate: failed to get nonce for signing");
        }

        const signatureRes = await ZanoWallet.signMessage(nonceRes);

        if (!signatureRes) {
            throw new Error("Unable to authenticate: failed to sign message with wallet");
        }

        const authRes = await FetchUtils.auth({
            address: walletInfo.address,
            alias: walletInfo.alias,
            message: nonceRes,
            signature: signatureRes
        });

        if (!authRes.success) {
            throw new Error(`Unable to authenticate: ${authRes.data}`);
        }

        this.token = authRes.data;
        logger.info("Thread authenticated successfully");
    }

    private async prepareSocket() {
        const socketClient = new SocketClient();
        await socketClient.initSocket();
        this.socketClient = socketClient;
    }

    private async ensureReconnected() {
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                const socket = this.socketClient?.getSocket();
                if (socket?.connected) {
                    return socket;
                }
                await this.prepareSocket();

            } catch (error) {
                logger.error(`Reconnection attempt ${attempt} failed:`, error);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before next attempt
            }
        }

        throw new Error("Failed to reconnect to socket after multiple attempts");
    }

    async onPairPageEvent(pairId: string, callback: () => Promise<any>) {
        if (!this.token) {
            throw new Error("Bot is not authenticated. Please call auth() before subscribing to order events.");
        }

        if (!this.socketClient) {
            throw new Error("Socket client is not initialized. Please call prepareSocket() before subscribing to order events.");
        }

        const setListeners = async () => {
            let socket = await this.ensureReconnected();

            socket?.emit("in-trading", { id: pairId }); // Subscribe to page events

            socket?.on("new-order", callback);
            socket?.on("delete-order", callback);
            socket?.on("update-orders", callback);
            socket?.on("disconnect", () => {
                logger.warn("Socket disconnected, attempting to reconnect...");
                try {
                    socket?.removeAllListeners();
                    socket.disconnect();
                } catch (_) { }
                return setListeners();
            });
        }

        setListeners();
    }

    async createOrder(pairId: string, type: "buy" | "sell", price: number, amount: number) {
        if (!this.token) {
            throw new Error("Bot is not authenticated. Please call auth() before creating orders.");
        }

        const result = await FetchUtils.createOrder(this.token, {
            type,
            side: "limit",
            price: price.toString(),
            amount: amount.toString(),
            pairId: parseInt(pairId),
        });

        if (!result.success) {
            throw new Error(`Failed to create order: ${result.data}`);
        }

        return result.data;
    }

    // delete all orders of the same pairId and type and create a new one.
    async createUniqueOrder(pairId: string, type: "buy" | "sell", price: number, amount: number) {
        if (!this.token) {
            throw new Error("Bot is not authenticated. Please call auth() before creating orders.");
        }

        const userOrders = await this.getUserOrders(pairId);

        const ordersToDelete = userOrders.orders
            .filter((order) =>
                order.type === type
            );

        for (const order of ordersToDelete) {
            await this.deleteOrder(order.id);
        }

        return await this.createOrder(pairId, type, price, amount);
    }

    async deleteOrder(orderId: number) {
        if (!this.token) {
            throw new Error("Bot is not authenticated. Please call auth() before deleting orders.");
        }

        const result = await FetchUtils.deleteOrder(this.token, orderId);

        if (!result.success) {
            throw new Error(`Failed to delete order: ${result.data}`);
        }

        return true;
    }

    async getUserOrders(pairId: string) {
        if (!this.token) {
            throw new Error("Bot is not authenticated. Please call auth() before fetching user orders.");
        }

        const result = await FetchUtils.getUserOrdersPage(this.token, parseInt(pairId));

        if (!result.success) {
            throw new Error(`Failed to fetch user orders: ${result.data}`);
        }

        return result.data;
    }
}
import * as env from "../env-vars";
import { io, Socket } from "socket.io-client";
import logger from "../logger";
import { queueThreadToRestart } from "./states";
import { checkThreadActivity, onOrdersNotify } from "./utils";
import { ConfigItem, ConfigItemParsed } from "../interfaces/common/Config";
import { NotificationParams } from "../interfaces/common/Common";
import { ActiveThread } from "../interfaces/common/State";

export default class SocketClient {
    private socket: Socket;

    async initSocket() {
        return new Promise<Socket>((resolve) => {
            const socket = io(env.CUSTOM_SERVER || "https://trade.zano.org", {
                reconnectionAttempts: 10,
                reconnectionDelay: 2000,
                timeout: 10000,
            });
            
            socket.on("connect", () => {
                logger.detailedInfo("Socket connected:", socket.id);
                this.socket = socket;
                resolve(socket);
            });
            socket.on("disconnect", (reason) => logger.warn("Socket disconnected:", reason));
            socket.on("reconnect_attempt", () => logger.detailedInfo("Attempting to reconnect..."));
            socket.on("reconnect", (attempt) => logger.detailedInfo("Reconnected successfully after", attempt, "attempt(s)"));
            socket.on("error", (error) => logger.error("Socket error:", error));
        });
    }

    async setSocketListeners(
        configItem: ConfigItemParsed, 
        notificationParams: NotificationParams,
        activeThreadData: ActiveThread,
    ) {
        logger.detailedInfo("Subscribing to Zano Trade WS events...");
        this.socket.emit("in-trading", { id: configItem.pairId });

        this.socket.on("new-order", async () => {
            logger.info(`New order message incoming via WS, starting order notification handler...`);
            await onOrdersNotify(...notificationParams);
        });

        this.socket.on("delete-order", async () => {
            console.log("DELETE ORDER", notificationParams);
            logger.info(`Order deleted message incoming via WS, starting order notification handler...`);
            await onOrdersNotify(...notificationParams);
        });

        this.socket.on("update-orders", async () => {
            logger.info(`Orders update message incoming via WS, starting order notification handler...`);
            await onOrdersNotify(...notificationParams);
        });
        
        this.socket.on("disconnect", async (reason) => {
            logger.warn(`Socket disconnected: ${reason}`);

            const threadActive = checkThreadActivity(activeThreadData);
            if (!threadActive) {
                logger.info("Thread is not active (socket), stopping activity checker...");
                return;
            }

            logger.info("Restarting thread in 5 seconds (socket)...");
            await new Promise(resolve => setTimeout(resolve, 5000));
            queueThreadToRestart(activeThreadData);
        });
    }

    getSocket() {
        return this.socket;
    }
}
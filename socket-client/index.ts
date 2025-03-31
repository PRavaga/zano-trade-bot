import * as env from "../env-vars";
import { io, Socket } from "socket.io-client";
import logger from "../logger";

export default class SocketClient {
    private socket: Socket;

    async initSocket() {
        return new Promise<Socket>((resolve, reject) => {
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

    getSocket() {
        return this.socket;
    }
}
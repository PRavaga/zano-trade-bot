import * as env from "../env-vars";
import { io, Socket } from "socket.io-client";
import logger from "../logger";

export default class SocketClient {
    private socket: Socket;

    constructor() {
        this.socket = this.initSocket();
    }

    initSocket() {
        const socket = io(env.CUSTOM_SERVER || "https://trade.zano.org", {
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
            timeout: 10000,
        });
        
        socket.on("connect", () => logger.detailedInfo("Socket connected:", socket.id));
        socket.on("disconnect", (reason) => logger.warn("Socket disconnected:", reason));
        socket.on("reconnect_attempt", () => logger.detailedInfo("Attempting to reconnect..."));
        socket.on("reconnect", (attempt) => logger.detailedInfo("Reconnected successfully after", attempt, "attempt(s)"));
        socket.on("error", (error) => logger.error("Socket error:", error));
    
        return socket;
    }

    getSocket() {
        return this.socket;
    }

    reconnectSocket() {

        try {
            if (this.socket) {
                this.socket.removeAllListeners(); 
                this.socket.disconnect();
            }
        } catch (error) {
            logger.error(`Socket cleanup failed: ${error}`);
        }

        this.socket = this.initSocket();
        return this.socket;
    }

    destroySocket() {
        this.socket.removeAllListeners();
        this.socket.disconnect();
    }
}
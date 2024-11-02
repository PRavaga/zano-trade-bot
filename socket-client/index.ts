import * as env from "../env-vars";
import { io } from "socket.io-client";
import logger from "../logger";

function initSocket() {
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

let socket = initSocket();

export function reconnectSocket() {
    try {
        socket.disconnect();
    } catch (error) {}

    socket = initSocket();

    return socket;
}

export function getSocket() {
    return socket;
}
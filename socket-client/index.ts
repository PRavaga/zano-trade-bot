import { io } from "socket.io-client";

const socket = io("https://trade.zano.org");

export default socket;
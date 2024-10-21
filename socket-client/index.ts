import * as env from "../env-vars";
import { io } from "socket.io-client";

const socket = io(env.CUSTOM_WS_SERVER || "https://trade.zano.org");

export default socket;
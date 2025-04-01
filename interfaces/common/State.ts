import SocketClient from "../../utils/socket";

export interface ActiveThread {
    socket: SocketClient;
    id: string;
}


export interface State {
    activeThreads: ActiveThread[];
    threadsToRestart: ActiveThread[];
}

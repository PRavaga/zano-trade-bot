import { ActiveThread, State } from "../interfaces/common/State";

export const state: State = {
    activeThreads: [],
    threadsToRestart: [],
}

export const addActiveThread = (thread: ActiveThread) => {
    state.activeThreads.push({
        socket: thread.socket,
        id: thread.id
    });
}

export const queueThreadToRestart = (thread: ActiveThread) => {
    if (!state.threadsToRestart.find(t => t.id === thread.id)) {
        state.threadsToRestart.push({
            socket: thread.socket,
            id: thread.id
        });
    }
}

export const deleteActiveThread = (thread: ActiveThread) => {
    const threadIndex = state.activeThreads.findIndex(t => t.id === thread.id);
    
    if (threadIndex !== -1) {
        state.activeThreads.splice(threadIndex, 1);
    }
}
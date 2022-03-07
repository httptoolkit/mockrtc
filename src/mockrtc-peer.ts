import { MockRTCConnectionParams } from "./mockrtc";

export interface MockRTCPeerOptions {
    recordMessages?: boolean;
}

export interface MockRTCPeer {
    readonly id: string;

    getSessionDescription(offer: RTCSessionDescriptionInit): Promise<MockRTCConnectionParams>;

    getAllMessages(): Promise<Array<string | Buffer>>;
    getMessagesOnChannel(channelName: string): Promise<Array<string | Buffer>>;
}
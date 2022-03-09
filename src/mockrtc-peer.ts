import { MockRTCOfferParams } from "./mockrtc";

export interface MockRTCPeerOptions {
    recordMessages?: boolean;
}

export interface MockRTCPeer {
    readonly id: string;

    createOffer(): Promise<MockRTCOfferParams>;
    answerOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;

    getAllMessages(): Promise<Array<string | Buffer>>;
    getMessagesOnChannel(channelName: string): Promise<Array<string | Buffer>>;
}
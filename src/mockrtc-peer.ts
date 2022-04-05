/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MockRTCPeerOptions {
    recordMessages?: boolean;
}

/**
 * A MockRTC peer represents a target you can connect to, and expose an API to create
 * offers or answers to create new connections.
 *
 * Peers have defined behaviour, and each connection will be handled accordingly and
 * independently.
 *
 * Peers can also optionally track all the messages and metadata across all their
 * connections.
 */
export interface MockRTCPeer {
    readonly peerId: string;

    // For direct usage:
    createOffer(): Promise<MockRTCOfferParams>;
    answerOffer(offer: RTCSessionDescriptionInit): Promise<MockRTCAnswerParams>;

    // For proxy usage:
    createExternalOffer(): Promise<MockRTCExternalOfferParams>;
    answerExternalOffer(offer: RTCSessionDescriptionInit): Promise<MockRTCExternalAnswerParams>;

    // For querying seen data
    getAllMessages(): Promise<Array<string | Buffer>>;
    getMessagesOnChannel(channelName: string): Promise<Array<string | Buffer>>;
}

/**
 * Once a connection has been created, you can access its session API. This allows
 * for renegotiation of an existing session, while persisting the same connection
 * and ongoing handling process.
 */
export interface MockRTCSessionAPI {
    createOffer(): Promise<RTCSessionDescriptionInit>;
    completeOffer(answer: RTCSessionDescriptionInit): Promise<void>;

    answerOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;
}

export interface MockRTCOfferParams {
    offer: RTCSessionDescriptionInit;
    setAnswer: (answer: RTCSessionDescriptionInit) => Promise<MockRTCSessionAPI>;
}

export interface MockRTCAnswerParams {
    answer: RTCSessionDescriptionInit;
    session: MockRTCSessionAPI;
}

export interface MockRTCExternalOfferParams {
    id: string; // Used for external attach control messages
    offer: RTCSessionDescriptionInit;
    setAnswer: (answer: RTCSessionDescriptionInit) => Promise<MockRTCSessionAPI>;
}

export interface MockRTCExternalAnswerParams {
    id: string; // Used for external attach control messagesz
    answer: RTCSessionDescriptionInit;
}
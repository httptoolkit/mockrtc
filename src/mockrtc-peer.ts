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
    createOffer(options?: OfferOptions): Promise<MockRTCOfferParams>;
    answerOffer(
        offer: RTCSessionDescriptionInit,
        options?: AnswerOptions
    ): Promise<MockRTCAnswerParams>;

    // For proxy usage:
    createExternalOffer(options?: OfferOptions): Promise<MockRTCExternalOfferParams>;
    answerExternalOffer(
        offer: RTCSessionDescriptionInit,
        options?: AnswerOptions
    ): Promise<MockRTCExternalAnswerParams>;

    // For advanced use cases, where you need to look up sessions dynamically:
    getSession(id: string): MockRTCSession;

    // For querying seen data
    getAllMessages(): Promise<Array<string | Buffer>>;
    getMessagesOnChannel(channelName: string): Promise<Array<string | Buffer>>;
}

/**
 * Once a connection has been created, you can access its session API. This allows
 * for renegotiation of an existing session, while persisting the same connection
 * and ongoing handling process.
 */
export interface MockRTCSession {
    /**
     * For most use cases explicitly using the session ID isn't necessary.
     *
     * For some advanced use cases though, it's more convenient to store session ids and use
     * peer.getSession, rather than using the session property from the setup methods directly.
     */
    readonly sessionId: string;

    createOffer(options?: OfferOptions): Promise<RTCSessionDescriptionInit>;
    completeOffer(answer: RTCSessionDescriptionInit): Promise<void>;

    answerOffer(offer: RTCSessionDescriptionInit, options?: AnswerOptions): Promise<RTCSessionDescriptionInit>;
}

export interface MockRTCOfferParams {
    offer: RTCSessionDescriptionInit;
    setAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
    session: MockRTCSession;
}

export interface MockRTCAnswerParams {
    answer: RTCSessionDescriptionInit;
    session: MockRTCSession;
}

export interface OfferOptions {
    /**
     * A raw SDP string that should be mirrored (best efforts) where possible to
     * create an equivalent offer, including the same media with the same params.
     */
    mirrorSDP?: string;

    /**
     * When using mirrorSDP, for SDP that only defines video/audio media we will
     * receive an offer with no data stream attached. This can be a problem for
     * proxied connections, which need a data stream to hook up the external
     * connection later. If addDataStream is set to true, a data stream will always
     * be created even if not present in the mirrored SDP.
     *
     * This option has no effect if mirrorSDP is not set.
     */
    addDataStream?: boolean;
}

export interface AnswerOptions {
    /**
     * A raw SDP string that should be mirrored (best efforts) where possible to
     * create an equivalent answer, including the same media params.
     */
    mirrorSDP?: string;
}

export interface MockRTCExternalOfferParams {
    id: string; // Used for external attach control messages
    offer: RTCSessionDescriptionInit;
    setAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
    session: MockRTCSession;
}

export interface MockRTCExternalAnswerParams {
    id: string; // Used for external attach control messagesz
    answer: RTCSessionDescriptionInit;
    session: MockRTCSession;
}
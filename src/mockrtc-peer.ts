/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockRTCSessionDescription } from './mockrtc';

export interface MockRTCPeerOptions {
    debug?: boolean;
    recordMessages?: boolean;
}

/**
 * A MockRTC peer represents a target you can connect to, and exposes an API to create
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

    /**
     * Creates an offer for a new connection to this mock peer.
     *
     * Returns a set of offer parameters: the offer itself, a session to renegotiate
     * the connection in future, and a setAnswer callback to call with an answer
     * once you have one.
     */
    createOffer(options?: OfferOptions): Promise<MockRTCOfferParams>;

    /**
     * Takes an offer for a WebRTC connection elsewhere, and creates an answer to
     * connect that to this peer.
     *
     * Returns a set of answer parameters: the answer itself, and a session to renegotiate
     * the connection in future.
     */
    answerOffer(
        offer: RTCSessionDescriptionInit,
        options?: AnswerOptions
    ): Promise<MockRTCAnswerParams>;

    /**
     * Creates an offer for a new external connection to this mock peer.
     *
     * External connections are used for proxying traffic. They do not do anything
     * by default (so they ignore this peer's configured steps) but a mock connection
     * can be connected to an external connection using methods like
     * {@link MockRTCHandlerBuilder.thenPassThrough thenPassThrough}.
     *
     * Returns a set of offer parameters: an external connection id, the offer itself,
     * a session to renegotiate the connection in future, and a setAnswer callback to
     * call with an answer once you have one.
     */
    createExternalOffer(options?: OfferOptions): Promise<MockRTCExternalOfferParams>;

    /**
     * Takes an offer for a WebRTC connection elsewhere, and creates an answer to create
     * an external connection to this peer.
     *
     * External connections are used for proxying traffic. They do not do anything
     * by default (so they ignore this peer's configured steps) but a mock connection
     * can be connected to an external connection using methods like
     * {@link MockRTCHandlerBuilder.thenPassThrough thenPassThrough}.
     *
     * Returns a set of answer parameters: an external connection id, the answer itself,
     * and a session to renegotiate the connection in future.
     */
    answerExternalOffer(
        offer: RTCSessionDescriptionInit,
        options?: AnswerOptions
    ): Promise<MockRTCExternalAnswerParams>;

    /**
     * Takes a connection id, and returns the associated session.
     *
     * This is useful for advanced use cases, where keeping the session returned by other
     * setup methods is inconvenient, and it's easier to keep ids and look up sessions
     * on demand instead.
     */
    getSession(id: string): MockRTCSession;

    /**
     * Retrieve an array of all data channel messages that this peer has received on
     * all connections.
     */
    getAllMessages(): Promise<Array<string | Buffer>>;

    /**
     * Retrieve an array of all data channel messages on a specific channel that this
     * peer has received on all connections.
     */
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

    /**
     * Create a new offer for this session, to renegotiate the existing connection.
     */
    createOffer(options?: OfferOptions): Promise<MockRTCSessionDescription>;

    /**
     * Provide an answer to complete an offer for this session, to renegotiate the existing connection.
     */
    completeOffer(answer: RTCSessionDescriptionInit): Promise<void>;

    /**
     * Get an answer given an offer from elsewhere, to renegotiate the existing connection.
     */
    answerOffer(offer: RTCSessionDescriptionInit, options?: AnswerOptions): Promise<MockRTCSessionDescription>;
}

export interface MockRTCOfferParams {
    offer: MockRTCSessionDescription;
    setAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
    session: MockRTCSession;
}

export interface MockRTCAnswerParams {
    answer: MockRTCSessionDescription;
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

    /**
     * Extra metadata to associate with the connection. This will be exposed on
     * events like peer-connected, and can be used to add context to connections.
     *
     * If this value is provided during renegotiation, it is merged key-wise with
     * any existing metadata value for the connection (i.e. existing metadata
     * values will not change, unless a new value for the same key is provided).
     */
    connectionMetadata?: ConnectionMetadata;
}

export interface AnswerOptions {
    /**
     * A raw SDP string that should be mirrored (best efforts) where possible to
     * create an equivalent answer, including the same media params.
     */
    mirrorSDP?: string;

    /**
     * Extra metadata to associate with the connection. This will be exposed on
     * events like peer-connected, and can be used to add context to connections.
     *
     * If this value is provided during renegotiation, it is merged key-wise with
     * any existing metadata value for the connection (i.e. existing metadata
     * values will not change, unless a new value for the same key is provided).
     */
    connectionMetadata?: ConnectionMetadata;
}

/**
 * Extra metadata to associate with the connection. This will be exposed on
 * events like peer-connected, and can be used to add context to connections.
 *
 * The defined fields may only be used as defined here, but all values are
 * optional, and any other metadata may be attached in any format here.
 *
 * The only defined values are:
 * - `userAgent` - a client user-agent string (in a browser, the value of
 *   `navigator.userAgent`)
 * - `sourceURL` - the URL of the referring page, when the request is sent by
 *   a browser
 */
export interface ConnectionMetadata {
    userAgent?: string;
    sourceURL?: string;
    [k: string]: any;
}

export interface MockRTCExternalOfferParams {
    id: string; // Used for external attach control messages
    offer: MockRTCSessionDescription;
    setAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
    session: MockRTCSession;
}

export interface MockRTCExternalAnswerParams {
    id: string; // Used for external attach control messagesz
    answer: MockRTCSessionDescription;
    session: MockRTCSession;
}
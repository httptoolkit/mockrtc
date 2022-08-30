/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockRTCSessionDescription } from './mockrtc';
import type {
    MockRTCPeer,
    MockRTCExternalAnswerParams,
    MockRTCExternalOfferParams,
    MockRTCOfferParams
} from "./mockrtc-peer";

import { MOCKRTC_CONTROL_CHANNEL } from "./webrtc/control-channel";

type OfferPairParams = MockRTCExternalOfferParams & { realOffer: RTCSessionDescriptionInit };
type AnswerPairParams = MockRTCExternalAnswerParams & { realAnswer: RTCSessionDescriptionInit };

/*
 * In this file, we define hooks which can automatically wrap an RTCPeerConnection so that the
 * normal calls to initialize a connection instead proxy the connection through MockRTC.
 *
 * This is quite complicated and confusing! There's four connection endpoints to be aware of:
 * - The original RTCPeerConnection that's being hooked here to connect to a mock ('internal')
 * - A MockRTC connection with an associated MockRTCPeer that it will actually connect to ('mock')
 * - The original remote peer that we're connecting to ('remote')
 * - A MockRTC external connection that will connect to the remote peer ('external')
 *
 * The connection structure works like so:
 * INTERNAL <--> MOCK <-?-> EXTERNAL <--> REMOTE
 *
 * Internal+Mock and External+Remote are connected via real WebRTC connections. Mock+External are
 * connected within MockRTC once mockConnection.proxyTrafficTo(externalConnection) is called,
 * which happens if/when a proxy step is reached (i.e. this depends on the configuration of the
 * mock peer).
 *
 * Note that in extra complicated cases, both peers might be hooked, in which case REMOTE is
 * actually the EXTERNAL for a second mirrored structure. We can mostly ignore this as it's
 * handled implicitly.
 */

/**
 * Hooks a given RTCPeerConnection so that all connections it creates are automatically proxied
 * through the given MockRTCPeer.
 *
 * This allows you to capture traffic without modifying your WebRTC code: you can create
 * offers/answers and signal them to a remote client as normal, and both the local and remote
 * connections will connect to MockRTC instead.
 *
 * What happens once they connect depends on the configuration of the given peer. This mocked
 * local connection will follow the steps defined by the peer, so may receive mocked messages
 * injected there, or delays, or anything else. The remote peer will receive nothing until
 * a proxy step is reached (if ever), at which point the local & remote peers will be able to
 * talking directly, although all traffic will still be proxied through MockRTC for logging
 * and analysis/validation elsewhere.
 *
 * It is possible to proxy both real peers in a connection, potentially with different mock
 * peers so that they experience different behaviours during the connection.
 *
 * @category API
 */
export function hookWebRTCConnection(conn: RTCPeerConnection, mockPeer: MockRTCPeer) {
    // Anything that creates signalling data (createOffer/createAnswer) needs to be hooked to
    // return the params for the external connected.
    // Anything that sets params (setLocal/RemoteDescription) needs to be hooked to send those
    // params to the external connection, create new equivalent mock params for the mock connection
    // and give those to the internal connection.

    const _createOffer = conn.createOffer.bind(conn);
    const _createAnswer = conn.createAnswer.bind(conn);
    const _setLocalDescription = conn.setLocalDescription.bind(conn);
    const _setRemoteDescription = conn.setRemoteDescription.bind(conn);

    // The offers/answers we've generated, and the params needed to use them later:
    let pendingCreatedOffers: { [sdp: string]: OfferPairParams } = {};
    let pendingCreatedAnswers: { [sdp: string]: AnswerPairParams } = {};

    // The offer/answer we generated that we're actually using, once one is selected:
    let selectedDescription: OfferPairParams | AnswerPairParams | undefined;

    // A mirrored offer from the mock conn to the internal conn, mirroring an incoming offer we
    // received from the remote conn. This is stored so that when we pick an answer it can be
    // completed, and so that createAnswer can wait until generation is complete before running.
    let mockOffer: Promise<MockRTCOfferParams> | undefined;

    // We create a control channel to communicate with MockRTC once the connection is set up.
    // That's created immediately, so its in the initial SDP, to avoid later negotation.
    const controlChannel = conn.createDataChannel(MOCKRTC_CONTROL_CHANNEL);
    new Promise<void>((resolve) => {
        controlChannel.onopen = () => resolve()
    }).then(() => {
        controlChannel.send(JSON.stringify({
            type: 'attach-external',
            id: selectedDescription!.id
        }));
    });

    conn.createOffer = (async (options: RTCOfferOptions) => {
        const realOffer = await _createOffer(options);
        const externalOfferParams = await mockPeer.createExternalOffer({
            mirrorSDP: realOffer.sdp!
        });
        const externalOffer = externalOfferParams.offer;
        pendingCreatedOffers[externalOffer.sdp!] = { ...externalOfferParams, realOffer };
        return externalOffer;
    }) as any;

    conn.createAnswer = (async (options: RTCAnswerOptions) => {
        await mockOffer; // If we have a pending offer, wait for that first - we can't answer without it.

        const realAnswer = await _createAnswer(options);
        const pendingAnswerParams = await mockPeer.answerExternalOffer(conn.pendingRemoteDescription!, {
            mirrorSDP: realAnswer.sdp
        });
        const externalAnswer = pendingAnswerParams.answer;
        pendingCreatedAnswers[externalAnswer.sdp!] = { ...pendingAnswerParams, realAnswer };
        return externalAnswer;
    }) as any;

    // Mock all mutations of the connection description:
    conn.setLocalDescription = (async (localDescription: RTCSessionDescriptionInit) => {
        if (!localDescription) {
            if (["stable", "have-local-offer", "have-remote-pranswer"].includes(conn.signalingState)) {
                localDescription = await conn.createOffer();
            } else {
                localDescription = await conn.createAnswer();
            }
        }

        // When we set an offer or answer locally, it must be the external offer/answer we've
        // generated to send to the other peer. We swap it back for a real equivalent that will
        // connect us to the mock peer instead:
        if (localDescription.type === 'offer') {
            pendingLocalDescription = localDescription;
            selectedDescription = pendingCreatedOffers[localDescription.sdp!];
            const { realOffer } = selectedDescription;
            await _setLocalDescription(realOffer);
        } else {
            selectedDescription = pendingCreatedAnswers[localDescription.sdp!];
            const { realAnswer } = selectedDescription;
            await Promise.all([
                // Complete the mock side of the internal connection:
                (await mockOffer!).setAnswer(realAnswer),
                // Complete the internal side of the internal connection:
                _setLocalDescription(realAnswer)
            ]);

            currentLocalDescription = localDescription;
            currentRemoteDescription = pendingRemoteDescription;
            pendingLocalDescription = null;
            pendingRemoteDescription = null;
        }
    }) as any;

    conn.setRemoteDescription = (async (remoteDescription: MockRTCSessionDescription) => {
        if (remoteDescription.type === 'offer') {
            // We have an offer! Remember it, so we can createAnswer shortly.
            pendingRemoteDescription = remoteDescription;

            // We persist the mock offer synchronously, so we can check for it in createAnswer
            // and avoid race conditions where we fail to create an answer before this method
            // hasn't yet completed.
            mockOffer = mockPeer.createOffer({
                mirrorSDP: remoteDescription.sdp,
                addDataStream: true,
                connectionMetadata: {
                    userAgent: navigator.userAgent,
                    sourceURL: window.location.href
                }
            });

            await _setRemoteDescription((await mockOffer).offer);
        } else {
            // We have an answer - we must've sent an offer, complete & use that:
            const { setAnswer, realOffer } = selectedDescription as OfferPairParams;
            await Promise.all([
                // Complete the external <-> remote connection:
                setAnswer(remoteDescription),
                // Complete the internal <-> mock connection:
                mockPeer.answerOffer(realOffer, {
                    mirrorSDP: remoteDescription.sdp,
                    connectionMetadata: {
                        userAgent: navigator.userAgent,
                        sourceURL: window.location.href
                    }
                }).then(({ answer }) => _setRemoteDescription(answer))
            ]);

            currentLocalDescription = pendingLocalDescription;
            currentRemoteDescription = remoteDescription;
            pendingLocalDescription = null;
            pendingRemoteDescription = null;
        }
    }) as any;

    // Mock various props that expose the connection description:
    let pendingLocalDescription: RTCSessionDescriptionInit | null = null;
    Object.defineProperty(conn, 'pendingLocalDescription', {
        get: () => pendingLocalDescription
    });

    let currentLocalDescription: RTCSessionDescriptionInit | null = null;
    Object.defineProperty(conn, 'currentLocalDescription', {
        get: () => currentLocalDescription
    });

    Object.defineProperty(conn, 'localDescription', {
        get: () => conn.pendingLocalDescription ?? conn.currentLocalDescription
    });

    let pendingRemoteDescription: RTCSessionDescriptionInit | null = null;
    Object.defineProperty(conn, 'pendingRemoteDescription', {
        get: () => pendingRemoteDescription
    });

    let currentRemoteDescription: RTCSessionDescriptionInit | null = null;
    Object.defineProperty(conn, 'currentRemoteDescription', {
        get: () => currentRemoteDescription
    });

    Object.defineProperty(conn, 'remoteDescription', {
        get: () => conn.pendingRemoteDescription ?? conn.currentRemoteDescription
    });

    Object.defineProperty(conn, 'onicecandidate', {
        get: () => {},
        set: () => {} // Ignore this completely - never call the callback
    });

    // For now we ignore incoming ice candidates. They're really intended for the external connection,
    // not us, but also they're rarely necessary since we should be using local connections and MockRTC
    // itself always waits rather than trickling candidates.
    conn.addIceCandidate = () => Promise.resolve();
}

/**
 * Modifies the global RTCPeerConnection constructor to hook all WebRTC connections
 * created after this function is called, and redirect all their traffic to the
 * provided MockRTCPeer.
 *
 * @category API
 */
export function hookAllWebRTC(mockPeer: MockRTCPeer) {
    // The original constructor
    const _RTCPeerConnection = window.RTCPeerConnection;

    window.RTCPeerConnection = function (this: RTCPeerConnection) {
        const connection = new _RTCPeerConnection(...arguments);
        hookWebRTCConnection(connection, mockPeer);
        return connection;
    } as any;

    window.RTCPeerConnection.prototype = _RTCPeerConnection.prototype;
}
/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

export { expect } from "chai";

import * as MockRTC from "../src/main-browser";

export { MockRTC };

// When running continuous tests, where the admin server restarts, we have a race condition
// between server restart & test run. To fix that, here we wait 10s for the admin server to
// become accessible before we run any tests.
before(async function () {
    this.timeout(10000);
    let shownMessage = false;

    while (true) {
        await delay(100);

        try {
            const server = MockRTC.getRemote();
            await server.start();
            await server.stop();
            break;
        } catch (e: any) {
            if (!shownMessage) {
                shownMessage = true;
                if (!(e instanceof TypeError)) {
                    console.log("Could not connect to admin server");
                    throw e;
                } else {
                    console.log("Waiting for admin server to start...");
                }
            }
        }
    }
});

export async function waitForState(connection: RTCPeerConnection, state: RTCPeerConnectionState) {
    await new Promise<void>((resolve) => {
        if (connection.connectionState === state) resolve();
        else {
            connection.addEventListener('connectionstatechange', () => {
                if (connection.connectionState === state) resolve();
            });
        }
    });
}

export async function waitForChannelOpen(channel: RTCDataChannel) {
    await new Promise<void>((resolve) => {
        if (channel.readyState === 'open') resolve();
        else {
            channel.addEventListener('open', () => resolve());
        }
    });
}

export async function waitForChannelClose(channel: RTCDataChannel) {
    await new Promise<void>((resolve) => {
        if (channel.readyState === 'closed') resolve();
        else {
            channel.addEventListener('close', () => resolve());
        }
    });
}

export function delay(durationMs: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs);
    });
}

// Connect a peer & signalling channel to connect with no specific direction specified, using
// the official example code from the spec:
export function setupPerfectNegotiation(
    peer: RTCPeerConnection,
    polite: boolean,
    signaler: { send: (msg: any) => void, onmessage: (msg: any) => void }
) {
    // Example almost verbatim from https://w3c.github.io/webrtc-pc/#perfect-negotiation-example

    // keep track of some negotiation state to prevent races and errors
    let makingOffer = false;
    let ignoreOffer = false;
    let isSettingRemoteAnswerPending = false;

    // send any ice candidates to the other peer
    peer.onicecandidate = ({candidate}) => signaler.send({candidate});

    // let the "negotiationneeded" event trigger offer generation
    peer.onnegotiationneeded = async () => {
        try {
            makingOffer = true;
            await peer.setLocalDescription();
            signaler.send({description: peer.localDescription});
        } catch (err) {
            console.error('onnegotiationneeded', err);
        } finally {
            makingOffer = false;
        }
    };

    signaler.onmessage = async ({description, candidate}) => {
        try {
            if (description) {
                // An offer may come in while we are busy processing SRD(answer).
                // In this case, we will be in "stable" by the time the offer is processed
                // so it is safe to chain it on our Operations Chain now.
                const readyForOffer = !makingOffer &&
                    (peer.signalingState == "stable" || isSettingRemoteAnswerPending);
                const offerCollision = description.type == "offer" && !readyForOffer;

                ignoreOffer = !polite && offerCollision;
                if (ignoreOffer) {
                    return;
                }
                isSettingRemoteAnswerPending = description.type == "answer";
                await peer.setRemoteDescription(description); // SRD rolls back as needed
                isSettingRemoteAnswerPending = false;
                if (description.type == "offer") {
                    await peer.setLocalDescription();
                    signaler.send({description: peer.localDescription});
                }
            } else if (candidate) {
                try {
                    await peer.addIceCandidate(candidate);
                } catch (err) {
                    if (!ignoreOffer) throw err; // Suppress ignored offer's candidates
                }
            }
        } catch (err) {
            console.error('onmessage error', err);
        }
    }
}

export type Deferred<T> = Promise<T> & {
    resolve(value: T): void,
    reject(e: Error): void
}
export function getDeferred<T>(): Deferred<T> {
    let resolveCallback: (value: T) => void;
    let rejectCallback: (e: Error) => void;
    let result = <Deferred<T>> new Promise((resolve, reject) => {
        resolveCallback = resolve;
        rejectCallback = reject;
    });
    result.resolve = resolveCallback!;
    result.reject = rejectCallback!;

    return result;
}
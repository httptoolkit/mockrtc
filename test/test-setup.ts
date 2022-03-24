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
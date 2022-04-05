/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    waitForState,
} from '../test-setup';

describe("Close steps", function () {

    this.timeout(10000); // Closing can take ~5 seconds to be recognized on the client

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should be able to close a connection immediately", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .thenClose();

        const localConnection = new RTCPeerConnection();

        const receivedMessages: string[] = [];
        const testChannel = localConnection.createDataChannel('data-channel');
        testChannel.addEventListener('message', (event) => { receivedMessages.push(event.data) });

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(answer);

        await waitForState(localConnection, 'connected');
        await waitForState(localConnection, 'disconnected');
    });

});
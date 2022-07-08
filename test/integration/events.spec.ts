/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockRTCEventData } from '../../src/mockrtc';
import {
    MockRTC,
    expect,
    getDeferred,
    waitForState,
    delay
} from '../test-setup';

describe("MockRTC event subscriptions", function () {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    describe("for connection events", function () {

        it("should fire an event when a mock peer connects", async () => {
            const eventPromise = getDeferred<MockRTCEventData['peer-connected']>();

            mockRTC.on('peer-connected', (peer) => eventPromise.resolve(peer));

            const mockPeer = await mockRTC.buildPeer().waitForNextMessage().thenSend('Goodbye');

            const localConnection = new RTCPeerConnection();

            const { offer, setAnswer } = await mockPeer.createOffer();
            await localConnection.setRemoteDescription(offer);

            const localAnswer = await localConnection.createAnswer();
            await localConnection.setLocalDescription(localAnswer);
            await setAnswer(localAnswer);

            // Wait until the connection opens successfully:
            await waitForState(localConnection, 'connected');

            const connectionEvent = await eventPromise;
            expect(connectionEvent.peerId).to.equal(mockPeer.peerId);
            expect(connectionEvent.sessionId).not.to.equal(undefined);
            expect(connectionEvent.localSdp.type).to.equal('offer');
            expect(connectionEvent.localSdp.sdp!.length).to.be.greaterThan(10);
            expect(connectionEvent.remoteSdp.type).to.equal('answer');
            expect(connectionEvent.remoteSdp.sdp!.length).to.be.greaterThan(10);
        });

        it("should not fire an event when an external peer connects", async () => {
            const eventPromise = getDeferred<MockRTCEventData['peer-connected']>();

            mockRTC.on('peer-connected', (peer) => eventPromise.resolve(peer));

            const mockPeer = await mockRTC.buildPeer().waitForNextMessage().thenSend('Goodbye');

            const localConnection = new RTCPeerConnection();

            const { offer, setAnswer } = await mockPeer.createExternalOffer();
            await localConnection.setRemoteDescription(offer);

            const localAnswer = await localConnection.createAnswer();
            await localConnection.setLocalDescription(localAnswer);
            await setAnswer(localAnswer);

            // Wait until the connection opens successfully:
            await waitForState(localConnection, 'connected');

            const result = await Promise.race([
                delay(500).then(() => 'timeout'),
                eventPromise
            ]);

            // No event fires within 500ms
            expect(result).to.equal('timeout');
        });

        it("should fire an event when a mock peer is disconnected", async () => {
            const eventPromise = getDeferred<MockRTCEventData['peer-disconnected']>();

            mockRTC.on('peer-disconnected', (peer) => eventPromise.resolve(peer));

            const mockPeer = await mockRTC.buildPeer().thenClose();

            const localConnection = new RTCPeerConnection();

            const { offer, setAnswer } = await mockPeer.createOffer();
            await localConnection.setRemoteDescription(offer);

            const localAnswer = await localConnection.createAnswer();
            await localConnection.setLocalDescription(localAnswer);
            await setAnswer(localAnswer);

            // Wait until the connection opens successfully:
            await waitForState(localConnection, 'connected');

            const connectionEvent = await eventPromise;
            expect(connectionEvent.peerId).to.equal(mockPeer.peerId);
            expect(connectionEvent.sessionId).not.to.equal(undefined);
        });

        it("should not fire an event when an external peer disconnects", async () => {
            const eventPromise = getDeferred<MockRTCEventData['peer-disconnected']>();

            mockRTC.on('peer-disconnected', (peer) => eventPromise.resolve(peer));

            const mockPeer = await mockRTC.buildPeer().thenClose();

            const localConnection = new RTCPeerConnection();

            const { offer, setAnswer } = await mockPeer.createExternalOffer();
            await localConnection.setRemoteDescription(offer);

            const localAnswer = await localConnection.createAnswer();
            await localConnection.setLocalDescription(localAnswer);
            await setAnswer(localAnswer);

            // Wait until the connection opens successfully:
            await waitForState(localConnection, 'connected');

            const result = await Promise.race([
                delay(500).then(() => 'timeout'),
                eventPromise
            ]);

            // No event fires within 500ms
            expect(result).to.equal('timeout');
        });

    });

});
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

        it("should fire an event when an external peer is attached", async () => {
            const eventPromise = getDeferred<MockRTCEventData['external-peer-attached']>();

            mockRTC.on('external-peer-attached', (peer) => eventPromise.resolve(peer));

            const mockPeer = await mockRTC.buildPeer().waitForNextMessage().thenSend('Goodbye');

            // Hook the local connection (so traffic is redirected via an external peer)
            const localConnection = new RTCPeerConnection();
            MockRTC.hookWebRTCConnection(localConnection, mockPeer);

            // Create and connect an unhooked remote connection:
            const remoteConn = new RTCPeerConnection();
            remoteConn.createDataChannel("test-channel");
            const remoteOffer = await remoteConn.createOffer();
            remoteConn.setLocalDescription(remoteOffer);
            await localConnection.setRemoteDescription(remoteOffer);
            const localAnswer = await localConnection.createAnswer();
            localConnection.setLocalDescription(localAnswer);

            // Wait until the connection opens successfully:
            await waitForState(localConnection, 'connected');

            const attachEvent = await eventPromise;
            expect(attachEvent.peerId).to.equal(mockPeer.peerId);
            expect(attachEvent.sessionId).not.to.equal(undefined);

            const { externalConnection } = attachEvent;
            expect(externalConnection.peerId).to.equal(mockPeer.peerId);
            expect(externalConnection.sessionId).not.to.equal(attachEvent.sessionId);
            expect(externalConnection.localSdp.type).to.equal('answer');
            expect(externalConnection.localSdp.sdp!.length).to.be.greaterThan(10);
            expect(externalConnection.remoteSdp.type).to.equal('offer');
            expect(externalConnection.remoteSdp.sdp!.length).to.be.greaterThan(10);
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

    describe("for data channels", function () {

        it("fires an event when a data channel is created", async () => {
            const eventPromise = getDeferred<MockRTCEventData['data-channel-opened']>();

            mockRTC.on('data-channel-opened', (channel) => eventPromise.resolve(channel));

            const mockPeer = await mockRTC.buildPeer()
                .waitForChannel()
                .thenSend('Test message');

            const localConnection = new RTCPeerConnection();
            localConnection.createDataChannel("test-channel");

            const localOffer = await localConnection.createOffer();
            await localConnection.setLocalDescription(localOffer);
            const { answer } = await mockPeer.answerOffer(localOffer);
            await localConnection.setRemoteDescription(answer);

            const channelEvent = await eventPromise;
            expect(channelEvent.peerId).to.equal(mockPeer.peerId);
            expect(channelEvent.sessionId).not.to.equal(undefined);
            expect(channelEvent.channelId).to.equal(1);
            expect(channelEvent.channelLabel).to.equal('test-channel');
        });

        it("fires an event when a data channel message is sent", async () => {
            const eventPromise = getDeferred<MockRTCEventData['data-channel-message-sent']>();

            mockRTC.on('data-channel-message-sent', (message) => eventPromise.resolve(message));

            const mockPeer = await mockRTC.buildPeer()
                .waitForChannel()
                .thenSend('Test message');

            const localConnection = new RTCPeerConnection();
            localConnection.createDataChannel("test-channel");

            const localOffer = await localConnection.createOffer();
            await localConnection.setLocalDescription(localOffer);
            const { answer } = await mockPeer.answerOffer(localOffer);
            await localConnection.setRemoteDescription(answer);

            const messageEvent = await eventPromise;
            expect(messageEvent.peerId).to.equal(mockPeer.peerId);
            expect(messageEvent.sessionId).not.to.equal(undefined);
            expect(messageEvent.channelId).to.equal(1);
            expect(messageEvent.isBinary).to.equal(false);
            expect(messageEvent.content.toString()).to.equal('Test message');
        });

        it("fires an event when a data channel message is received", async () => {
            const eventPromise = getDeferred<MockRTCEventData['data-channel-message-received']>();

            mockRTC.on('data-channel-message-received', (message) => eventPromise.resolve(message));

            const mockPeer = await mockRTC.buildPeer()
                .waitForChannel()
                .send('Outgoing message')
                .waitForNextMessage()
                .thenClose();

            const localConnection = new RTCPeerConnection();
            const dataChannel = localConnection.createDataChannel("test-channel");

            // Send a message to MockRTC once the connection opens:
            dataChannel.addEventListener('open', () => {
                dataChannel.send(
                    Buffer.from('Technically binary message from client')
                );
            });

            const localOffer = await localConnection.createOffer();
            await localConnection.setLocalDescription(localOffer);
            const { answer } = await mockPeer.answerOffer(localOffer);
            await localConnection.setRemoteDescription(answer);

            const messageEvent = await eventPromise;
            expect(messageEvent.peerId).to.equal(mockPeer.peerId);
            expect(messageEvent.sessionId).not.to.equal(undefined);
            expect(messageEvent.channelId).to.equal(1);

            expect(messageEvent.isBinary).to.equal(true);
            expect(messageEvent.content.toString()).to.equal('Technically binary message from client');
        });

        it("fires an event when a data channel is closed", async () => {
            const eventPromise = getDeferred<MockRTCEventData['data-channel-closed']>();

            mockRTC.on('data-channel-closed', (channel) => eventPromise.resolve(channel));

            const mockPeer = await mockRTC.buildPeer()
                .waitForChannel()
                .thenClose();

            const localConnection = new RTCPeerConnection();
            const dataChannel = localConnection.createDataChannel("test-channel");

            const localOffer = await localConnection.createOffer();
            await localConnection.setLocalDescription(localOffer);
            const { answer } = await mockPeer.answerOffer(localOffer);
            await localConnection.setRemoteDescription(answer);

            dataChannel.addEventListener('open', () => dataChannel.close());

            const channelEvent = await eventPromise;
            expect(channelEvent.peerId).to.equal(mockPeer.peerId);
            expect(channelEvent.sessionId).not.to.equal(undefined);
            expect(channelEvent.channelId).to.equal(1);
        });

    });

});
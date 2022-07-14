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

            const { offer, setAnswer } = await mockPeer.createOffer({
                connectionMetadata: {
                    userAgent: navigator.userAgent
                }
            });
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

            expect(connectionEvent.metadata.userAgent).to.equal(navigator.userAgent);

            const { selectedLocalCandidate, selectedRemoteCandidate } = connectionEvent;
            [selectedLocalCandidate, selectedRemoteCandidate].forEach((candidate) => {
                expect(candidate.address).to.match(/[:\w\.]+/); // IPv4 or 6
                expect(candidate.port).to.be.greaterThan(0);
                expect(candidate.protocol).to.equal('udp');
                expect(candidate.type).not.to.equal(undefined);
            });
            expect(selectedLocalCandidate.port).to.not.equal(selectedRemoteCandidate.port);
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
            remoteConn.setRemoteDescription(localAnswer);

            // Wait until the connection opens successfully:
            await waitForState(localConnection, 'connected');

            const attachEvent = await eventPromise;
            expect(attachEvent.peerId).to.equal(mockPeer.peerId);
            expect(attachEvent.sessionId).not.to.equal(undefined);

            const { externalConnection } = attachEvent;
            expect(externalConnection.sessionId).not.to.equal(attachEvent.sessionId);
            expect(externalConnection.localSdp.type).to.equal('answer');
            expect(externalConnection.localSdp.sdp!.length).to.be.greaterThan(10);
            expect(externalConnection.remoteSdp.type).to.equal('offer');
            expect(externalConnection.remoteSdp.sdp!.length).to.be.greaterThan(10);

            const { selectedLocalCandidate, selectedRemoteCandidate } = externalConnection;
            [selectedLocalCandidate, selectedRemoteCandidate].forEach((candidate) => {
                expect(candidate.address).to.match(/[:\w\.]+/); // IPv4 or 6
                expect(candidate.port).to.be.greaterThan(0);
                expect(candidate.protocol).to.equal('udp');
                expect(candidate.type).not.to.equal(undefined);
            });
            expect(selectedLocalCandidate.port).to.not.equal(selectedRemoteCandidate.port);
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
            localConnection.createDataChannel("test-channel", {
                protocol: "mockrtc-protocol"
            });

            const localOffer = await localConnection.createOffer();
            await localConnection.setLocalDescription(localOffer);
            const { answer } = await mockPeer.answerOffer(localOffer);
            await localConnection.setRemoteDescription(answer);

            const channelEvent = await eventPromise;
            expect(channelEvent.peerId).to.equal(mockPeer.peerId);
            expect(channelEvent.sessionId).not.to.equal(undefined);
            expect(channelEvent.channelId).to.equal(1);
            expect(channelEvent.channelLabel).to.equal('test-channel');
            expect(channelEvent.channelProtocol).to.equal("mockrtc-protocol");
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

            expect(messageEvent.direction).to.equal('sent');
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

            expect(messageEvent.direction).to.equal('received');
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

        it("does not fire any events for external connection data channels", async () => {
            const eventPromises = ([
                'data-channel-opened',
                'data-channel-message-sent',
                'data-channel-message-received',
                'data-channel-closed'
            ] as const).map((eventName) => {
                const eventPromise = getDeferred<MockRTCEventData[typeof eventName]>();
                mockRTC.on(eventName, (message) => eventPromise.resolve(message));
                return eventPromise;
            });

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
            const { answer } = await mockPeer.answerExternalOffer(localOffer); // <-- External
            await localConnection.setRemoteDescription(answer);

            const result = await Promise.race([
                delay(500).then(() => 'timeout'),
                ...eventPromises
            ]);

            // No event fires within 500ms
            expect(result).to.equal('timeout');
        });

    });

    describe("for media tracks", function () {

        it("fires an event when a media track is created", async () => {
            const eventPromise = getDeferred<MockRTCEventData['media-track-opened']>();

            mockRTC.on('media-track-opened', (track) => eventPromise.resolve(track));

            const mockPeer = await mockRTC.buildPeer()
                .waitForNextMedia()
                .thenClose();

            const localConnection = new RTCPeerConnection();

            const localOffer = await localConnection.createOffer({
                offerToReceiveAudio: true
            });
            await localConnection.setLocalDescription(localOffer);
            const { answer } = await mockPeer.answerOffer(localOffer);
            await localConnection.setRemoteDescription(answer);

            const trackEvent = await eventPromise;
            expect(trackEvent.peerId).to.equal(mockPeer.peerId);
            expect(trackEvent.sessionId).not.to.equal(undefined);
            expect(trackEvent.trackMid).to.equal("0");
            expect(trackEvent.trackDirection).to.equal("SendOnly");
            expect(trackEvent.trackType).to.equal("audio");
        });

        it("fires an event when a media track is closed", async () => {
            const eventPromise = getDeferred<MockRTCEventData['media-track-closed']>();

            mockRTC.on('media-track-closed', (track) => eventPromise.resolve(track));

            const mockPeer = await mockRTC.buildPeer()
                .thenEcho();

            const localConnection = new RTCPeerConnection();
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach((track) => localConnection.addTrack(track, stream));

            const localOffer = await localConnection.createOffer();
            await localConnection.setLocalDescription(localOffer);
            const { answer } = await mockPeer.answerOffer(localOffer);
            await localConnection.setRemoteDescription(answer);

            await waitForState(localConnection, 'connected');

            // Close the connection entirely, implicitly closing the media tracks:
            localConnection.close();
            // (renegotiating doesn't work - browsers keep the stream but updates direction to 'inactive')

            const trackEvent = await eventPromise;
            expect(trackEvent.peerId).to.equal(mockPeer.peerId);
            expect(trackEvent.sessionId).not.to.equal(undefined);
            expect(trackEvent.trackMid).to.equal("0");
        });

        it("should fire media stats events whilst the connection is open", async function () {
            this.timeout(5000);

            const receivedStats: Array<MockRTCEventData['media-track-stats']> = [];
            mockRTC.on('media-track-stats', (stats) => receivedStats.push(stats));

            const mockPeer = await mockRTC.buildPeer()
                .sleep(10000)
                .thenClose();

            const localConnection = new RTCPeerConnection();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => localConnection.addTrack(track, stream));

            const localOffer = await localConnection.createOffer();
            await localConnection.setLocalDescription(localOffer);
            const { answer, session } = await mockPeer.answerOffer(await localOffer);
            await localConnection.setRemoteDescription(answer);

            await waitForState(localConnection, 'connected');
            await delay(2500); // Stats fires every 1s

            expect(receivedStats.length).to.be.greaterThanOrEqual(2);
            receivedStats.forEach((stats) => {
                expect(stats.peerId).to.equal(mockPeer.peerId);
                expect(stats.sessionId).to.equal(session.sessionId);
                expect(stats.trackMid).to.equal("0");
            });
            const [firstStats, secondStats] = receivedStats;

            expect(firstStats.totalBytesReceived).to.be.greaterThan(1);
            expect(firstStats.totalBytesSent).to.equal(0);

            expect(secondStats.totalBytesReceived).to.be.greaterThan(firstStats.totalBytesReceived);
            expect(secondStats.totalBytesSent).to.equal(0);
        });

    });


});
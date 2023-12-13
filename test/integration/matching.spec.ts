/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    expect,
    delay
} from '../test-setup';

describe("Connection rule matching", () => {

    const mockRTC = MockRTC.getRemote({ recordMessages: true });

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("by default, matches and proxies all connections", async () => {
        const remoteConn = new RTCPeerConnection();
        const remotelyReceivedMessages: Array<string | Buffer> = [];

        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) =>
                remotelyReceivedMessages.push(data)
            );
        });

        const matchingPeer = await mockRTC.getMatchingPeer();
        // No rules defined!

        // Create a local data connection:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, matchingPeer); // Automatically redirect traffic via matchingPeer

        const dataChannel = localConn.createDataChannel("dataChannel");

        // Create a local offer (which will be hooked automatically):
        const localOffer = await localConn.createOffer();
        localConn.setLocalDescription(localOffer);

        // v-- Normally happens remotely, via signalling ---
        remoteConn.setRemoteDescription(localOffer);
        const remoteAnswer = await remoteConn.createAnswer();
        remoteConn.setLocalDescription(remoteAnswer);
        // ^-- Normally happens remotely, via signalling ---

        // Accept the real remote answer, and start communicating:
        localConn.setRemoteDescription(remoteAnswer);

        await new Promise<void>((resolve) => dataChannel.onopen = () => resolve());

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await delay(500); // Usually be much quicker locally, but can be slow in CI

        // Traffic is passed through untouched, as expected:
        expect(remotelyReceivedMessages).to.deep.equal([
            'local message 1',
            'local message 2',
            'local message 3'
        ]);

        // But does go through the proxy:
        expect(await matchingPeer.getAllMessages()).to.deep.equal([
            'local message 1',
            'local message 2',
            'local message 3',
        ]);
    });

    it("can match data connections", async () => {
        // Explicitly hard-close media connections:
        await mockRTC.forConnections()
            .withMedia()
            .thenClose();

        // Send a message on data channels only:
        await mockRTC.forConnections()
            .withDataChannels()
            .waitForChannel()
            .thenSend('bye');

        const matchingPeer = await mockRTC.getMatchingPeer();

        // Create a local data connection:
        const localConn = new RTCPeerConnection();

        const dataChannel = localConn.createDataChannel("dataChannel");

        const messagePromise = new Promise((resolve) => {
            dataChannel.addEventListener('message', ({ data }) => resolve(data));
        });

        const localOffer = await localConn.createOffer();
        await localConn.setLocalDescription(localOffer);
        const { answer } = await matchingPeer.answerOffer(localOffer);
        await localConn.setRemoteDescription(answer);

        // Wait until the matching handler sends the configured message:
        const receivedMessage = await messagePromise;
        expect(receivedMessage).to.equal('bye');
    });

    it("can match media connections", async () => {
        // Explicitly hard-close data connections:
        await mockRTC.forConnections()
            .withDataChannels()
            .thenClose();

        // Send a message on media connections only:
        await mockRTC.forConnections()
            .withMedia()
            .thenEcho();

        const matchingPeer = await mockRTC.getMatchingPeer();

        // Create a local connection:
        const localConn = new RTCPeerConnection();
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        localConn.addTrack(stream.getTracks()[0], stream);

        // Turn incoming tracks into readable streams of frames:
        const mediaStreamPromise = new Promise<ReadableStream<VideoFrame>>((resolve) => {
            localConn.addEventListener('track', ({ track }) => {
                const streamProcessor = new MediaStreamTrackProcessor({
                    track: track as MediaStreamVideoTrack
                });
                resolve(streamProcessor.readable);
            });
        });

        // Connect the local connection to the matching peer:
        const localOffer = await localConn.createOffer();
        await localConn.setLocalDescription(localOffer);
        const { answer } = await matchingPeer.answerOffer(localOffer);
        await localConn.setRemoteDescription(answer);

        // Check that our video is mirrored as expected:
        const localMedia = await mediaStreamPromise;
        const { value: localFrame } = await localMedia!.getReader().read();
        expect(localFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(localFrame!.displayWidth).to.be.greaterThanOrEqual(320);
    });

    it("can match connections by host", async () => {
        // Send a message for connections made from example.com pages:
        await mockRTC.forConnections()
            .fromPageHostname('example.com')
            .waitForChannel()
            .thenSend('hello example.com');

        // Close any other connections:
        await mockRTC.forConnections()
            .thenClose();

        const matchingPeer = await mockRTC.getMatchingPeer();

        // Create a local data connection:
        const localConn = new RTCPeerConnection();

        const dataChannel = localConn.createDataChannel("dataChannel");

        const messagePromise = new Promise((resolve) => {
            dataChannel.addEventListener('message', ({ data }) => resolve(data));
        });

        const localOffer = await localConn.createOffer();
        await localConn.setLocalDescription(localOffer);
        const { answer } = await matchingPeer.answerOffer(localOffer, {
            connectionMetadata: {
                sourceURL: 'https://example.com/abc?x=y#123'
            }
        });
        await localConn.setRemoteDescription(answer);

        // Wait until the matching handler sends the configured message:
        const receivedMessage = await messagePromise;
        expect(receivedMessage).to.equal('hello example.com');
    });

    it("can match connections by URL regex", async () => {
        // Close some other connections:
        await mockRTC.forConnections()
            .fromPageUrlMatching(/\?1+1=3/)
            .thenClose();

        // Send a message for connections made from matching pages:
        await mockRTC.forConnections()
            .fromPageUrlMatching(/\?x=y/)
            .waitForChannel()
            .thenSend('hello x=y');

        const matchingPeer = await mockRTC.getMatchingPeer();

        // Create a local data connection:
        const localConn = new RTCPeerConnection();

        const dataChannel = localConn.createDataChannel("dataChannel");

        const messagePromise = new Promise((resolve) => {
            dataChannel.addEventListener('message', ({ data }) => resolve(data));
        });

        const localOffer = await localConn.createOffer();
        await localConn.setLocalDescription(localOffer);
        const { answer } = await matchingPeer.answerOffer(localOffer, {
            connectionMetadata: {
                sourceURL: 'https://example.com/abc?x=y#123'
            }
        });
        await localConn.setRemoteDescription(answer);

        // Wait until the matching handler sends the configured message:
        const receivedMessage = await messagePromise;
        expect(receivedMessage).to.equal('hello x=y');
    });

    it("can match connections by user agent regex", async () => {
        // Close some other connections:
        await mockRTC.forConnections()
            .fromUserAgentMatching(/IE6/)
            .thenClose();

        // Send a message for connections made from Firefox:
        await mockRTC.forConnections()
            .fromUserAgentMatching(/Firefox/)
            .waitForChannel()
            .thenSend('hello Firefox');

        const matchingPeer = await mockRTC.getMatchingPeer();

        // Create a local data connection:
        const localConn = new RTCPeerConnection();

        const dataChannel = localConn.createDataChannel("dataChannel");

        const messagePromise = new Promise((resolve) => {
            dataChannel.addEventListener('message', ({ data }) => resolve(data));
        });

        const localOffer = await localConn.createOffer();
        await localConn.setLocalDescription(localOffer);
        const { answer } = await matchingPeer.answerOffer(localOffer, {
            connectionMetadata: {
                userAgent: 'Mozilla/5.0 (Firefox/123)'
            }
        });
        await localConn.setRemoteDescription(answer);

        // Wait until the matching handler sends the configured message:
        const receivedMessage = await messagePromise;
        expect(receivedMessage).to.equal('hello Firefox');
    });
});
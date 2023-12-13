/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockRTCEventData } from '../../src/mockrtc';
import {
    MockRTC,
    expect,
    waitForChannelOpen,
    waitForChannelClose,
    waitForState,
    setupPerfectNegotiation,
    getDeferred,
    delay
} from '../test-setup';

describe("When proxying WebRTC traffic", () => {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should be able to transparently forward messages to a configured peer", async () => {
        const remoteConn = new RTCPeerConnection();
        const remotelyReceivedMessages: Array<string | Buffer> = [];

        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 1");
            channel.send("remote message 2");
            channel.send("remote message 3");
            setTimeout(() => channel.close(), 100);
        });

        const mockPeer = await mockRTC.buildPeer()
            .waitForNextMessage()
            .send('Injected message')
            .thenForwardTo(remoteConn);

        // Create a data connection:
        const localConn = new RTCPeerConnection();

        const dataChannel = localConn.createDataChannel("dataChannel");
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        const localOffer = await localConn.createOffer();
        localConn.setLocalDescription(localOffer);

        // Get the remote details for the mock peer:
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConn.setRemoteDescription(answer);

        await waitForChannelOpen(dataChannel);

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await waitForChannelClose(dataChannel);

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by thenSend step
            'remote message 1',
            'remote message 2',
            'remote message 3'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            // First message is captured by waitForNextMessage step
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently forward media to a configured peer", async () => {
        const remoteConn = new RTCPeerConnection();

        // Turn the remote's received tracks into readable streams of frames:
        const receivedMediaStreamPromise = new Promise<ReadableStream<VideoFrame>>((resolve) => {
            remoteConn.addEventListener('track', ({ track }) => {
                const streamProcessor = new MediaStreamTrackProcessor({
                    track: track as MediaStreamVideoTrack
                });
                resolve(streamProcessor.readable);
            });
        });

        const mockPeer = await mockRTC.buildPeer()
            .thenForwardTo(remoteConn);

        // Create a data connection that will send video:
        const localConn = new RTCPeerConnection();
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        localConn.addTrack(stream.getTracks()[0], stream);

        const localOffer = await localConn.createOffer();
        localConn.setLocalDescription(localOffer);

        // Get the remote details for the mock peer:
        const { answer } = await mockPeer.answerOffer(localOffer);
        await localConn.setRemoteDescription(answer);

        // Check we receive the expected echoed video in the remote peer:
        const localMedia = await receivedMediaStreamPromise;
        const { value: localFrame } = await localMedia!.getReader().read();
        expect(localFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(localFrame!.displayWidth).to.be.greaterThanOrEqual(320);
    });

    it("should be able to transparently proxy messages to a dynamically provided peer, sending offer", async () => {
        const remoteConn = new RTCPeerConnection();
        const remotelyReceivedMessages: Array<string | Buffer> = [];

        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 1");
            channel.send("remote message 2");
            channel.send("remote message 3");
            setTimeout(() => channel.close(), 100);
        });

        const mockPeer = await mockRTC.buildPeer()
            .waitForNextMessage()
            .send('Injected message')
            .thenPassThrough();

        // Create a local data connection:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, mockPeer); // Automatically redirect traffic via mockPeer

        const dataChannel = localConn.createDataChannel("dataChannel");
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

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

        await new Promise((resolve) => dataChannel.addEventListener('close', resolve));
        await delay(200);

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by thenSend step
            'remote message 1',
            'remote message 2',
            'remote message 3'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            // First message is captured by waitForNextMessage step
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently proxy messages to dynamically provided peer, receiving answer", async () => {
        const remoteConn = new RTCPeerConnection();
        remoteConn.createDataChannel("empty-channel"); // We need to create at least one channel/track to get an offer
        const remotelyReceivedMessages: Array<string | Buffer> = [];

        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 1");
            channel.send("remote message 2");
            channel.send("remote message 3");
            setTimeout(() => channel.close(), 100);
        });

        const mockPeer = await mockRTC.buildPeer()
            .waitForNextMessage()
            .send('Injected message')
            .thenPassThrough();

        // Remote connection starts first, sending us a real offer:
        const remoteOffer = await remoteConn.createOffer();
        remoteConn.setLocalDescription(remoteOffer);

        // Create a local data connection:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, mockPeer); // Automatically redirect traffic via mockPeer

        const dataChannel = localConn.createDataChannel("dataChannel");
        const channelOpenPromise = new Promise<void>((resolve) => dataChannel.onopen = () => resolve());
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        // Receive the remote offer, use that locally to create an answer (this is all hooked):
        await localConn.setRemoteDescription(remoteOffer);
        const localAnswer = await localConn.createAnswer();
        localConn.setLocalDescription(localAnswer);

        // Signal the answer back to the real unhooked remote connection:
        await remoteConn.setRemoteDescription(localAnswer);

        await channelOpenPromise;

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await new Promise((resolve) => dataChannel.addEventListener('close', resolve));
        await delay(200);

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by thenSend step
            'remote message 1',
            'remote message 2',
            'remote message 3'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            // First message is captured by waitForNextMessage step
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently proxy messages when hooking both ends of a connection", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForNextMessage()
            .send('Injected message')
            .thenPassThrough();

        const remoteConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(remoteConn, mockPeer); // Automatically redirect traffic via mockPeer

        const remotelyReceivedMessages: Array<string | Buffer> = [];

        // Like localChannel, We have to create an outgoing channel for the wait & send step.
        remoteConn.createDataChannel("remote-channel").onopen = function () {
            this.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            this.send('remote message 1'); // Required on an outgoing channel to pass waitForNextMessage
        };

        // Remote listens for local's channel, sends replies, and closes
        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 2");
            channel.send("remote message 3");
            channel.send("remote message 4");
            setTimeout(() => channel.close(), 100);
        });

        // Remote connection starts first, sending a hooked offer:
        const remoteOffer = await remoteConn.createOffer();
        remoteConn.setLocalDescription(remoteOffer);

        // We create a local data connection too:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, mockPeer); // Automatically redirect traffic via mockPeer

        const dataChannel = localConn.createDataChannel("localDataChannel");
        const channelOpenPromise = new Promise<void>((resolve) => dataChannel.onopen = () => resolve());
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        // Receive the remote offer, use that locally to create an answer (all hooked):
        await localConn.setRemoteDescription(remoteOffer);
        const localAnswer = await localConn.createAnswer();
        localConn.setLocalDescription(localAnswer);

        // Signal the answer back to the remote connection, which hooks this too:
        await remoteConn.setRemoteDescription(localAnswer);

        await channelOpenPromise;

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await new Promise((resolve) => dataChannel.addEventListener('close', resolve));
        await delay(200);

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by send step
            'remote message 2',
            'remote message 3',
            'remote message 4'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by send step here too! Both peers are hooked
            // Local message is eaten by waitForNextMessage
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently proxy messages when hooking both ends of a perfect negotiation", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .sleep(100)
            .send('Injected message')
            .thenPassThrough();

        // Two hooked peers:
        const remoteConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(remoteConn, mockPeer);
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, mockPeer);

        // A fake synchronous signalling channel:
        const signaler1 = { send: (msg: any) => signaler2.onmessage(msg), onmessage: (msg: any) => {} };
        const signaler2 = { send: (msg: any) => signaler1.onmessage(msg), onmessage: (msg: any) => {} };

        // Do perfect negotiation in parallel to connect our two peers:
        setupPerfectNegotiation(remoteConn, true, signaler1); // Polite
        setupPerfectNegotiation(localConn, false, signaler2); // Impolite

        const remotelyReceivedMessages: Array<string | Buffer> = [];

        // Remote listens for local's channel, sends replies, and closes
        remoteConn.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 2");
            channel.send("remote message 3");
            channel.send("remote message 4");
            setTimeout(() => channel.close(), 100);
        });

        const dataChannel = localConn.createDataChannel("localDataChannel");
        const channelOpenPromise = new Promise<void>((resolve) => dataChannel.onopen = () => resolve());
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        await channelOpenPromise;

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await new Promise((resolve) => dataChannel.addEventListener('close', resolve));
        await delay(200);

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by send step
            'remote message 2',
            'remote message 3',
            'remote message 4'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            'local message 1',
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently proxy offered media through a hooked connection", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .thenPassThrough();

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });

        // One real peer:
        const remoteConn = new RTCPeerConnection();

        // One hooked peer:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, mockPeer);

        // Both connections offer to send media:
        remoteConn.addTrack(stream.getTracks()[0], stream);
        localConn.addTrack(stream.getTracks()[0], stream);

        // Turn incoming tracks into readable streams of frames:
        const mediaStreamPromise = Promise.all([remoteConn, localConn].map((conn) => {
            return new Promise<ReadableStream<VideoFrame>>((resolve) => {
                conn.addEventListener('track', ({ track }) => {
                    const streamProcessor = new MediaStreamTrackProcessor({
                        track: track as MediaStreamVideoTrack
                    });
                    resolve(streamProcessor.readable);
                });
            });
        }));

        // Set up the connection
        const localOffer = await localConn.createOffer(); // Hooked
        localConn.setLocalDescription(localOffer); // Hooked
        remoteConn.setRemoteDescription(localOffer);
        const remoteAnswer = await remoteConn.createAnswer();
        remoteConn.setLocalDescription(remoteAnswer);
        localConn.setRemoteDescription(remoteAnswer); // Hooked

        await waitForState(remoteConn, 'connected');

        // Extract the first frame from each, once they arrive:
        const [remoteMedia, localMedia] = await mediaStreamPromise;
        const { value: remoteFrame } = await remoteMedia!.getReader().read();
        const { value: localFrame } = await localMedia!.getReader().read();

        // Check both peers receive video - using sizes from fake media when running headlessly:
        expect(localFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(localFrame!.displayWidth).to.be.greaterThanOrEqual(320);
        expect(remoteFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(remoteFrame!.displayWidth).to.be.greaterThanOrEqual(320);
    });

    it("should be able to transparently proxy answered media through a hooked connection", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .thenPassThrough();

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });

        // One real peer:
        const remoteConn = new RTCPeerConnection();

        // One hooked peer:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, mockPeer);

        // Both connections offer to send media:
        remoteConn.addTrack(stream.getTracks()[0], stream);
        localConn.addTrack(stream.getTracks()[0], stream);

        // Turn incoming tracks into readable streams of frames:
        const mediaStreamPromise = Promise.all([remoteConn, localConn].map((conn) => {
            return new Promise<ReadableStream<VideoFrame>>((resolve) => {
                conn.addEventListener('track', ({ track }) => {
                    const streamProcessor = new MediaStreamTrackProcessor({
                        track: track as MediaStreamVideoTrack
                    });
                    resolve(streamProcessor.readable);
                });
            });
        }));

        // Set up the connection
        const remoteOffer = await remoteConn.createOffer();
        remoteConn.setLocalDescription(remoteOffer);
        localConn.setRemoteDescription(remoteOffer); // Hooked
        const localAnswer = await localConn.createAnswer(); // Hooked
        localConn.setLocalDescription(localAnswer); // Hooked
        remoteConn.setRemoteDescription(localAnswer);

        await waitForState(remoteConn, 'connected');

        // Extract the first frame from each, once they arrive:
        const [remoteMedia, localMedia] = await mediaStreamPromise;
        const { value: remoteFrame } = await remoteMedia!.getReader().read();
        const { value: localFrame } = await localMedia!.getReader().read();

        // Check both peers receive video - using sizes from fake media when running headlessly:
        expect(localFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(localFrame!.displayWidth).to.be.greaterThanOrEqual(320);
        expect(remoteFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(remoteFrame!.displayWidth).to.be.greaterThanOrEqual(320);
    });

    it("should be able to transparently proxy media when hooking both ends of a perfect negotiation", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .thenPassThrough();

        const stream1 = await navigator.mediaDevices.getUserMedia({ video: true });
        const stream2 = await navigator.mediaDevices.getUserMedia({ video: true });

        // Two hooked peers:
        const remoteConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(remoteConn, mockPeer);
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, mockPeer);

        // A fake synchronous signalling channel:
        const signaler1 = { send: (msg: any) => signaler2.onmessage(msg), onmessage: (msg: any) => {} };
        const signaler2 = { send: (msg: any) => signaler1.onmessage(msg), onmessage: (msg: any) => {} };

        // Do perfect negotiation in parallel to connect our two peers:
        setupPerfectNegotiation(localConn, true, signaler1); // Polite
        setTimeout(() => {
            // Add a tiny delay to deal with https://bugs.chromium.org/p/chromium/issues/detail?id=1315611
            setupPerfectNegotiation(remoteConn, false, signaler2); // Impolite
        }, 1);

        // Both peers send user media as a video stream:
        ([
            [localConn, stream1, 'local'],
            [remoteConn, stream2, 'remote']
        ] as const).forEach(([conn, stream, name]) => {
            const track = stream.getTracks()[0];
            conn.addTrack(track, stream);
        });

        // Turn incoming tracks into readable streams of frames:
        const mediaStreamPromise = Promise.all([
            localConn,
            remoteConn
        ].map((conn, i) => {
            return new Promise<ReadableStream<VideoFrame>>((resolve) => {
                conn.addEventListener('track', ({ track }) => {
                    const streamProcessor = new MediaStreamTrackProcessor({
                        track: track as MediaStreamVideoTrack
                    });
                    resolve(streamProcessor.readable);
                });
            });
        }));

        await waitForState(remoteConn, 'connected');

        // Extract the first frame from each, once they arrive:
        const [
            localMedia,
            remoteMedia
        ] = await mediaStreamPromise;
        const { value: remoteFrame } = await remoteMedia!.getReader().read();
        const { value: localFrame } = await localMedia!.getReader().read();

        // Check both peers receive video - using sizes from fake media when running headlessly:
        expect(localFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(localFrame!.displayWidth).to.be.greaterThanOrEqual(320);
        expect(remoteFrame!.displayHeight).to.be.greaterThanOrEqual(240);
        expect(remoteFrame!.displayWidth).to.be.greaterThanOrEqual(320);
    });

    it("should include user-agent & URL metadata when creating a hooked offer", async () => {
        const eventPromise = getDeferred<MockRTCEventData['peer-connected']>();
        mockRTC.on('peer-connected', (peer) => eventPromise.resolve(peer));

        const remoteConn = new RTCPeerConnection();

        const mockPeer = await mockRTC.buildPeer()
            .thenClose();

        // Create a local data connection:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, mockPeer); // Automatically redirect traffic via mockPeer
        localConn.createDataChannel("dataChannel");

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

        // Check that the connection event automatically includes the user agent:
        const connectEvent = await eventPromise;
        expect(connectEvent.metadata.userAgent).to.equal(navigator.userAgent);
        expect(connectEvent.metadata.sourceURL).to.equal(window.location.href);
    });

    it("should include user-agent & URL metadata when creating a hooked answer", async () => {
        const eventPromise = getDeferred<MockRTCEventData['peer-connected']>();
        mockRTC.on('peer-connected', (peer) => eventPromise.resolve(peer));

        const remoteConn = new RTCPeerConnection();
        remoteConn.createDataChannel("empty-channel"); // Need at least one channel/track to get an offer

        const mockPeer = await mockRTC.buildPeer()
            .thenClose();

        // Remote connection starts first, sending us a real offer:
        const remoteOffer = await remoteConn.createOffer();
        remoteConn.setLocalDescription(remoteOffer);

        // Create a local data connection:
        const localConn = new RTCPeerConnection();
        MockRTC.hookWebRTCConnection(localConn, mockPeer); // Automatically redirect traffic via mockPeer

        // Receive the remote offer, use that locally to create an answer (this is all hooked):
        await localConn.setRemoteDescription(remoteOffer);
        const localAnswer = await localConn.createAnswer();
        localConn.setLocalDescription(localAnswer);

        // Signal the answer back to the real unhooked remote connection:
        await remoteConn.setRemoteDescription(localAnswer);

        // Check that the connection event automatically includes the user agent:
        const connectEvent = await eventPromise;
        expect(connectEvent.metadata.userAgent).to.equal(navigator.userAgent);
        expect(connectEvent.metadata.sourceURL).to.equal(window.location.href);
    });

});
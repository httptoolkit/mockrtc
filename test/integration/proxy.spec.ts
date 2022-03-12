import {
    MockRTC,
    expect
} from '../test-setup';

describe("When proxying WebRTC traffic", () => {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    function hookWebRTCPeer(conn: RTCPeerConnection, mockPeer: MockRTC.MockRTCPeer) {
        // Anything that creates signalling data (createOffer/createAnswer) needs to be hooked to
        // return the params for the external mock peer.
        // Anything that sets params needs to be hooked to send to & set those params on the external
        // mock peer, create new params, signal those to the local mock peer.

        const _createOffer = conn.createOffer.bind(conn);
        const _setLocalDescription = conn.setLocalDescription.bind(conn);
        const _setRemoteDescription = conn.setRemoteDescription.bind(conn);

        let externalOffers: {
            [sdp: string]: MockRTC.MockRTCExternalOfferParams
        } = {};
        let selectedOffer: MockRTC.MockRTCExternalOfferParams | undefined;
        let internalAnswer: Promise<RTCSessionDescriptionInit> | undefined;

        conn.addEventListener('connectionstatechange', async (state) => {
            if (conn.connectionState === 'connected') {
                const controlChannel = conn.createDataChannel(MockRTC.MOCKRTC_CONTROL_CHANNEL);
                await new Promise<void>((resolve) => controlChannel.onopen = () => resolve());
                controlChannel.send(JSON.stringify({ type: 'attach-external', id: selectedOffer!.id }));
            }
        });

        conn.createOffer = (async () => {
            const externalOfferParams = await mockPeer.createExternalOffer();
            const externalOffer = externalOfferParams.offer;
            externalOffers[externalOffer.sdp!] = externalOfferParams;
            return externalOffer;
        }) as any;

        conn.setLocalDescription = (async (externalOffer: RTCSessionDescriptionInit) => {
            selectedOffer = externalOffers[externalOffer.sdp!];
            const realOffer = _createOffer();
            // Start mock answer generation async, so it's ready/waitablein
            // setRemoteDescription if it's not complete by then.
            internalAnswer = realOffer.then((offer) => mockPeer.answerOffer(offer));
            return _setLocalDescription(await realOffer);
        }) as any;

        conn.setRemoteDescription = (async (remoteAnswer: RTCSessionDescriptionInit) => {
            await selectedOffer!.setAnswer(remoteAnswer);
            _setRemoteDescription(await internalAnswer!);
        }) as any;
    }

    it("should be able to transparently forward messages to a configured peer", async () => {
        const remotePeer = new RTCPeerConnection();
        const remotelyReceivedMessages: Array<string | Buffer> = [];

        remotePeer.addEventListener('datachannel', ({ channel }) => {
            channel.addEventListener('message', ({ data }) => remotelyReceivedMessages.push(data));
            channel.send("remote message 1");
            channel.send("remote message 2");
            channel.send("remote message 3");
            setTimeout(() => channel.close(), 100);
        });

        const mockPeer = await mockRTC.buildPeer()
            .waitForMessage()
            .send('Injected message')
            .thenForwardTo(remotePeer);

        // Create a data connection:
        const localPeer = new RTCPeerConnection();

        const dataChannel = localPeer.createDataChannel("dataChannel");
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        const localOffer = await localPeer.createOffer();
        localPeer.setLocalDescription(localOffer);

        // Get the remote details for the mock peer:
        const mockAnswer = await mockPeer.answerOffer(localOffer);
        await localPeer.setRemoteDescription(mockAnswer);

        await new Promise((resolve) => dataChannel.addEventListener('open', resolve));

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await new Promise((resolve) => dataChannel.addEventListener('close', resolve));

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by thenSend step
            'remote message 1',
            'remote message 2',
            'remote message 3'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            // First message is captured by waitForMessage step
            'local message 2',
            'local message 3'
        ]);
    });

    it("should be able to transparently forward messages to dynamically provided peer from offer", async () => {
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
            .waitForMessage()
            .send('Injected message')
            .thenForwardDynamically();

        // Create a local data connection:
        const localConn = new RTCPeerConnection();
        hookWebRTCPeer(localConn, mockPeer); // Automatically redirect traffic via mockPeer

        const dataChannel = localConn.createDataChannel("dataChannel");
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        // Connect the remote data connection to MockRTC:
        const localOffer = await localConn.createOffer();
        localConn.setLocalDescription(localOffer);

        // v-- Normally happens remotely, via signalling ---
        remoteConn.setRemoteDescription(localOffer);
        const remoteAnswer = await remoteConn.createAnswer();
        remoteConn.setLocalDescription(remoteAnswer);
        // ^-- Normally happens remotely, via signalling ---

        localConn.setRemoteDescription(remoteAnswer);

        await new Promise<void>((resolve) => dataChannel.onopen = () => resolve());

        dataChannel.send('local message 1');
        dataChannel.send('local message 2');
        dataChannel.send('local message 3');

        await new Promise((resolve) => dataChannel.addEventListener('close', resolve));

        expect(locallyReceivedMessages).to.deep.equal([
            'Injected message', // Injected by thenSend step
            'remote message 1',
            'remote message 2',
            'remote message 3'
        ]);

        expect(remotelyReceivedMessages).to.deep.equal([
            // First message is captured by waitForMessage step
            'local message 2',
            'local message 3'
        ]);
    });

});
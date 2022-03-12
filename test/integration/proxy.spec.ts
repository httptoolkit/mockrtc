import {
    MockRTC,
    expect
} from '../test-setup';

describe("When proxying WebRTC traffic", () => {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

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

        const dataChannel = localConn.createDataChannel("dataChannel");
        const locallyReceivedMessages: Array<string | Buffer> = [];
        dataChannel.addEventListener('message', ({ data }) => locallyReceivedMessages.push(data));

        // Connect the remote data connection to MockRTC:
        const externalOfferParams = await mockPeer.createExternalOffer();
        remoteConn.setRemoteDescription(externalOfferParams.offer);
        const remoteAnswer = await remoteConn.createAnswer();
        remoteConn.setLocalDescription(remoteAnswer);
        externalOfferParams.setAnswer(remoteAnswer);

        // Manually hook & replace offer:
        const localOffer = await localConn.createOffer();
        localConn.setLocalDescription(localOffer);
        const mockAnswer = await mockPeer.answerOffer(localOffer);
        localConn.setRemoteDescription(mockAnswer);

        const controlChannel = localConn.createDataChannel(MockRTC.MOCKRTC_CONTROL_CHANNEL);
        await Promise.all([
            new Promise<void>((resolve) => controlChannel.onopen = () => resolve()),
            new Promise<void>((resolve) => dataChannel.onopen = () => resolve())
        ]);

        controlChannel.send(JSON.stringify({ type: 'attach-external', id: externalOfferParams.id }));

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
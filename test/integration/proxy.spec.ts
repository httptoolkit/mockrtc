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

});
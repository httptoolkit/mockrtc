import {
    MockRTC,
    expect,
    waitForChannelClose
} from '../test-setup';

describe("Send steps", function () {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should be able to send a message on all data channels", async () => {
        const mockPeer = await mockRTC.buildPeer()
            .waitForChannel('dataChannel1')
            .waitForChannel('dataChannel2')
            .thenSend('Hello and goodbye');

        const localConnection = new RTCPeerConnection();
        const dataChannel1 = localConnection.createDataChannel("dataChannel1");
        const dataChannel2 = localConnection.createDataChannel("dataChannel2");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const mockAnswer = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(mockAnswer);

        // Wait for a response:
        let messages: Array<any> = [];
        dataChannel1.addEventListener('message', (event) => messages.push("1: " + event.data));
        dataChannel2.addEventListener('message', (event) => messages.push("2: " + event.data));

        await waitForChannelClose(dataChannel1);

        expect(messages).to.deep.equal([
            '1: Hello and goodbye',
            '2: Hello and goodbye',
        ]);
    });

    it("should be able to send a message on specific named data channels", async () => {
        // Create a mock peer who sends 'Goodbye' after receiving its first message.
        const mockPeer = await mockRTC.buildPeer()
            .waitForChannel('dataChannel1')
            .waitForChannel('dataChannel2')
            .thenSend('dataChannel2', 'Hello and goodbye');

        const localConnection = new RTCPeerConnection();
        const dataChannel1 = localConnection.createDataChannel("dataChannel1");
        const dataChannel2 = localConnection.createDataChannel("dataChannel2");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);
        const mockAnswer = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(mockAnswer);

        // Wait for a response:
        let messages: Array<any> = [];
        dataChannel1.addEventListener('message', (event) => messages.push("1: " + event.data));
        dataChannel2.addEventListener('message', (event) => messages.push("2: " + event.data));

        await waitForChannelClose(dataChannel1);

        // We only see a 2nd channel message:
        expect(messages).to.deep.equal([
            '2: Hello and goodbye',
        ]);
    });

});
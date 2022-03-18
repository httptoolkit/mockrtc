import {
    MockRTC,
    expect
} from '../test-setup';

describe("Send steps", function () {

    const mockRTC = MockRTC.getRemote();

    beforeEach(() => mockRTC.start());
    afterEach(() => mockRTC.stop());

    it("should be able to send a message on all data channels", async () => {
        // Create a mock peer who sends 'Goodbye' after receiving its first message.
        const mockPeer = await mockRTC.buildPeer()
            .waitForChannel()
            .sleep(100)
            .thenSend('Hello and goodbye');

        // Create a data connection:
        const localConnection = new RTCPeerConnection();
        const dataChannel1 = localConnection.createDataChannel("dataChannel1");
        const dataChannel2 = localConnection.createDataChannel("dataChannel2");

        const localOffer = await localConnection.createOffer();
        await localConnection.setLocalDescription(localOffer);

        // Get the remote details for the mock peer:
        const mockAnswer = await mockPeer.answerOffer(localOffer);
        await localConnection.setRemoteDescription(mockAnswer);

        // Wait for a response:
        let messages: Array<any> = [];
        dataChannel1.addEventListener('message', (event) => messages.push("1: " + event.data));
        dataChannel2.addEventListener('message', (event) => messages.push("2: " + event.data));

        await new Promise<void>((resolve) => {
            if (dataChannel1.readyState === "closed") resolve();
            dataChannel1.addEventListener('close', () => resolve());
        });

        expect(messages).to.deep.equal([
            '1: Hello and goodbye',
            '2: Hello and goodbye',
        ]);
    });

});
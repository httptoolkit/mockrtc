import {
    type HandlerStep,
    PeerProxyStep,
    SendStep,
    DynamicProxyStep,
    WaitForChannelStep,
    WaitForMessageStep,
    WaitForDurationStep,
    CloseStep
} from "./handler-steps";

/**
 * The builder logic for composing RTC handling behaviour for both mock peers and rules,
 * by internally queuing defined actions until a `.thenX()` method is called to compile
 * the actions into either a peer or a rule (handled by an constructor callback param).
 */
export class MockRTCHandlerBuilder<R> {

    private handlerSteps: HandlerStep[] = [];

    constructor(
        private buildCallback: (handlerSteps: HandlerStep[]) => Promise<R>
    ) {}

    /**
     * Wait for a given duration, in milliseconds
     */
    sleep(duration: number): this {
        this.handlerSteps.push(new WaitForDurationStep(duration));
        return this;
    }

    /**
     * Wait until the remote client has opened at least one DataChannel.
     */
    waitForChannel(): this {
        this.handlerSteps.push(new WaitForChannelStep());
        return this;
    }

    /**
     * Wait until the remote client sends a message to us on any DataChannel.
     *
     * This looks for new messages, ignoring any messages already consumed by
     * previous steps.
     */
    waitForMessage(): this {
        this.handlerSteps.push(new WaitForMessageStep());
        return this;
    }

    /**
     * Wait until the remote client sends a message to us on a specific DataChannel.
     *
     * This looks for new messages, ignoring any messages already consumed by
     * previous steps.
     */
    waitForMessageOnChannel(channelLabel: string): this {
        this.handlerSteps.push(new WaitForMessageStep(channelLabel));
        return this;
    }

    send(message: string | Buffer): this {
        this.handlerSteps.push(new SendStep(message));
        return this;
    }

    thenClose(): Promise<R> {
        this.handlerSteps.push(new CloseStep());
        return this.buildCallback(this.handlerSteps);
    }

    thenSend(message: string | Buffer): Promise<R> {
        return this.send(message)
            .buildCallback(this.handlerSteps);
    }

    thenForwardTo(peer: RTCPeerConnection): Promise<R> {
        this.handlerSteps.push(new PeerProxyStep(peer));
        return this.buildCallback(this.handlerSteps);
    }

    thenForwardDynamically(): Promise<R> {
        this.handlerSteps.push(new DynamicProxyStep());
        return this.buildCallback(this.handlerSteps);
    }

}

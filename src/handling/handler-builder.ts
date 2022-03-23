import {
    type HandlerStep,
    PeerProxyStep,
    SendStep,
    DynamicProxyStep,
    WaitForChannelStep,
    WaitForMessageStep,
    WaitForDurationStep,
    CloseStep,
    EchoStep
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
    waitForChannel(channelLabel?: string): this {
        this.handlerSteps.push(new WaitForChannelStep(channelLabel));
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

    send(message: string | Buffer): this;
    send(channel: string | undefined, message: string | Buffer): this;
    send(...args: [string | undefined, string | Buffer] | [string | Buffer]): this {
        if (args[1] !== undefined) {
            const [channel, message] = args as [string, string | Buffer];
            this.handlerSteps.push(new SendStep(channel, message));
        } else {
            const [message] = args as [string | Buffer];
            this.handlerSteps.push(new SendStep(undefined, message));
        }
        return this;
    }

    thenSend(message: string | Buffer): Promise<R>;
    thenSend(channel: string, message: string | Buffer): Promise<R>;
    thenSend(...args: [string, string | Buffer] | [string | Buffer]): Promise<R> {
        return this.send(...args as [string | undefined, string | Buffer])
            .buildCallback(this.handlerSteps);
    }

    thenEcho(): Promise<R> {
        this.handlerSteps.push(new EchoStep());
        return this.buildCallback(this.handlerSteps);
    }

    thenClose(): Promise<R> {
        this.handlerSteps.push(new CloseStep());
        return this.buildCallback(this.handlerSteps);
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

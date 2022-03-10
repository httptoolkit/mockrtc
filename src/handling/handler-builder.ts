import {
    type HandlerStep,
    PeerProxyStep,
    SendStep,
    WaitStep
} from "./handler-steps";

/**
 * The builder logic for composing RTC handling behaviour for both mock peers and rules,
 * by internally queuing defined actions until a `.thenX()` method is called to compile
 * the actions into either a peer or a rule (handled by an abstract method).
 */
export class MockRTCHandlerBuilder<R> {

    private handlerSteps: HandlerStep[] = [];

    constructor(
        private buildCallback: (handlerSteps: HandlerStep[]) => Promise<R>
    ) {}

    waitForMessage(): this {
        this.handlerSteps.push(new WaitStep());
        return this;
    }

    send(message: string | Buffer): this {
        this.handlerSteps.push(new SendStep(message));
        return this;
    }

    thenSend(message: string | Buffer): Promise<R> {
        return this.send(message)
            .buildCallback(this.handlerSteps);
    }

    thenForwardTo(peer: RTCPeerConnection): Promise<R> {
        this.handlerSteps.push(new PeerProxyStep(peer));
        return this.buildCallback(this.handlerSteps);
    }

}

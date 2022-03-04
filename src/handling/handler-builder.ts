import { HandlerStep, SendStep, WaitStep } from "./handler-steps";

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

    thenSend(message: string | Buffer): Promise<R> {
        this.handlerSteps.push(new SendStep(message));
        return this.buildCallback(this.handlerSteps);
    }

}

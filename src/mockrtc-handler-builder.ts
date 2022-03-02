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
        // Handler logic not yet implemented
        return this;
    }

    thenReply(response: string | Buffer): Promise<R> {
        // Handler logic not yet implemented
        return this.buildCallback(this.handlerSteps);
    }

}

export interface HandlerStep {
}
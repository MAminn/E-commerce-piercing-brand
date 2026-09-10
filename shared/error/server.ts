export class ServerError<Tag extends string> extends Error {
  readonly _tag: Tag;
  readonly statusCode: number;
  readonly name = "ServerError";
  readonly clientMessage: string = "Something went wrong.";
  constructor({
    tag,
    message,
    statusCode,
    clientMessage,
    cause,
  }: {
    tag: Tag;
    message?: string;
    statusCode?: number;
    clientMessage?: string;
    cause?: unknown;
  }) {
    super(
      message ?? (cause instanceof Error ? cause.message : "Unknown error")
    );
    this._tag = tag;
    this.statusCode = statusCode ?? 500;
    this.clientMessage = clientMessage ?? this.clientMessage;
  }
}

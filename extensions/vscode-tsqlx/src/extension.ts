import * as path from "node:path";
import type { ExtensionContext } from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext) {
  const serverPath = path.join(
    context.extensionPath,
    "node_modules",
    "@tsqlx",
    "language-server",
    "dist",
    "server.js",
  );

  const serverOptions: ServerOptions = {
    run: { command: "node", args: [serverPath] },
    debug: {
      command: "node",
      args: ["--nolazy", "--inspect=6609", serverPath],
    },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "tsq" }],
  };

  client = new LanguageClient(
    "tsqlx",
    "TSQL-X Language Server",
    serverOptions,
    clientOptions,
  );
  void client.start();
  context.subscriptions.push({
    dispose: () => {
      void client?.stop();
    },
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}

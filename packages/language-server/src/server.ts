#!/usr/bin/env node
import {
  compile,
  findParamForSlotName,
  findSlotAtOffset,
  formatParamDeclMarkdown,
} from "@tsqlx/core";
import type { TextDocumentPositionParams } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from "vscode-languageserver/node.js";
import { toLsDiagnostic } from "./convert.js";

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

function publish(uri: string, text: string) {
  const { diagnostics } = compile(text);
  connection.sendDiagnostics({
    uri,
    diagnostics: diagnostics.map((d) => toLsDiagnostic(d)),
  });
}

function validate(textDoc: TextDocument) {
  publish(textDoc.uri, textDoc.getText());
}

connection.onInitialize(() => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      hoverProvider: true,
    },
  };
});

documents.onDidOpen((e) => {
  validate(e.document);
});
documents.onDidChangeContent((change) => {
  validate(change.document);
});
documents.onDidClose((e) => {
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

connection.onHover((params: TextDocumentPositionParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const offset = doc.offsetAt(params.position);
  const { ast } = compile(doc.getText());
  const slot = findSlotAtOffset(ast, offset);
  if (!slot) return null;
  const p = findParamForSlotName(ast, slot.name);
  const value = p
    ? formatParamDeclMarkdown(p)
    : `**Undeclared slot** \`${slot.name}\` — add it to an \`@input\` block.`;
  return {
    contents: {
      kind: "markdown" as const,
      value,
    },
  };
});

documents.listen(connection);
connection.listen();

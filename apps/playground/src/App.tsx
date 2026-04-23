import Editor, { type OnMount } from "@monaco-editor/react";
import { generate } from "@tsqlx/codegen";
import type { Diagnostic } from "@tsqlx/core";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_EXAMPLE_ID,
  type ExampleId,
  PLAYGROUND_EXAMPLES,
} from "./examples";
import { SAMPLE_TSQ } from "./initialTsq";
import "./App.css";

const DEBOUNCE_MS = 250;
const TSQ_PATH = "file:///playground.tsq";

function diagnosticsToMarkers(
  monaco: typeof Monaco,
  diagnostics: Diagnostic[],
): Monaco.editor.IMarkerData[] {
  return diagnostics.map((d) => ({
    severity:
      d.severity === "error"
        ? monaco.MarkerSeverity.Error
        : d.severity === "warning"
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
    startLineNumber: d.span.start.line,
    startColumn: d.span.start.col,
    endLineNumber: d.span.end.line,
    endColumn: d.span.end.col,
    message: `[${d.code}] ${d.message}`,
  }));
}

export function App() {
  const [tsq, setTsq] = useState(SAMPLE_TSQ);
  const [exampleId, setExampleId] = useState<ExampleId>(DEFAULT_EXAMPLE_ID);
  const [generated, setGenerated] = useState("");
  const monacoRef = useRef<typeof Monaco | null>(null);
  const leftModelRef = useRef<Monaco.editor.ITextModel | null>(null);

  const runCompile = useCallback((source: string) => {
    const result = generate(source, "playground.tsq", { target: "pg" });
    setGenerated(result.code || "");
    const monaco = monacoRef.current;
    const model = leftModelRef.current;
    if (monaco && model) {
      monaco.editor.setModelMarkers(
        model,
        "tsqlx",
        diagnosticsToMarkers(monaco, result.diagnostics),
      );
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => runCompile(tsq), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [tsq, runCompile]);

  const onLeftMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    const model = editor.getModel();
    leftModelRef.current = model;
    if (model) {
      monaco.editor.setModelMarkers(model, "tsqlx", []);
    }
    runCompile(tsq);
  };

  const copyOut = () => {
    void navigator.clipboard.writeText(generated);
  };

  const resetSample = () => {
    setExampleId(DEFAULT_EXAMPLE_ID);
    setTsq(SAMPLE_TSQ);
  };

  const onPickExample = (id: ExampleId) => {
    setExampleId(id);
    const row = PLAYGROUND_EXAMPLES.find((e) => e.id === id);
    if (row) {
      setTsq(row.content);
    }
  };

  return (
    <div className="app">
      <header>
        <div>
          <h1>TSQL-X Playground</h1>
          <p>
            Edit <code style={{ color: "#79c0ff" }}>.tsq</code> on the left —
            generated TypeScript (<code style={{ color: "#79c0ff" }}>pg</code>{" "}
            target) updates on the right.
          </p>
        </div>
        <div className="actions">
          <label className="example-picker">
            Example{" "}
            <select
              value={exampleId}
              onChange={(e) => onPickExample(e.target.value as ExampleId)}
              aria-label="Load example .tsq"
            >
              {PLAYGROUND_EXAMPLES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={copyOut}>
            Copy output
          </button>
          <button type="button" onClick={resetSample}>
            Reset sample
          </button>
        </div>
      </header>
      <div className="panels">
        <div className="panel">
          <label htmlFor="tsq-editor">playground.tsq</label>
          <div className="editor-wrap">
            <Editor
              path={TSQ_PATH}
              defaultLanguage="plaintext"
              theme="vs-dark"
              value={tsq}
              onChange={(v) => setTsq(v ?? "")}
              onMount={onLeftMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                autoIndent: "none",
                formatOnType: false,
                formatOnPaste: false,
              }}
            />
          </div>
        </div>
        <div className="panel">
          <label htmlFor="ts-out">Generated TypeScript</label>
          <div className="editor-wrap">
            <Editor
              path="file:///playground.tsq.ts"
              defaultLanguage="typescript"
              theme="vs-dark"
              value={generated || "// (no output — fix errors in .tsq)"}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

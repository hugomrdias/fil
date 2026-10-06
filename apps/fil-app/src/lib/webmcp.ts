/**
 * Minimal types for the WebMCP imperative API, which TypeScript's DOM types
 * do not include yet. WebMCP is an early preview in Chromium behind
 * `chrome://flags/#enable-webmcp-testing`, so callers feature-detect it.
 *
 * @see https://webmachinelearning.github.io/webmcp/
 */

/** JSON Schema for a tool's input. */
export type ToolInputSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

/** Hints that tell agents how a tool behaves. */
export type ToolAnnotations = {
  /** The tool only reads state. */
  readOnlyHint?: boolean
  /** The tool takes a high-stakes action; agents should confirm first. */
  consequentialHint?: boolean
  /** The tool returns content this site does not control. */
  untrustedContentHint?: boolean
}

/** A tool a page registers for browser agents. */
export type ModelContextTool<Input = Record<string, unknown>> = {
  name: string
  description: string
  inputSchema: ToolInputSchema
  execute: (input: Input, options: { signal: AbortSignal }) => unknown
  annotations?: ToolAnnotations
}

/** The `document.modelContext` registry. */
type ModelContext = {
  registerTool: (
    tool: ModelContextTool<never>,
    options?: { signal?: AbortSignal }
  ) => Promise<void> | undefined
}

/**
 * The page's WebMCP registry, or `undefined` when the browser lacks WebMCP.
 */
export function modelContext(): ModelContext | undefined {
  if (typeof document === 'undefined' || !('modelContext' in document)) {
    return undefined
  }
  return (document as Document & { modelContext: ModelContext }).modelContext
}

/**
 * Register a WebMCP tool until `signal` aborts. Does nothing when the
 * browser lacks WebMCP. A failed registration is ignored, because the tool
 * is an optional extra on top of the page.
 *
 * @param tool - Tool definition.
 * @param signal - Aborting it unregisters the tool.
 */
export function registerTool<Input>(
  tool: ModelContextTool<Input>,
  signal: AbortSignal
) {
  const context = modelContext()
  if (!context || signal.aborted) {
    return
  }
  const ignore = () => {
    // The page works the same without the tool.
  }
  try {
    Promise.resolve(
      context.registerTool(tool as ModelContextTool<never>, { signal })
    ).catch(ignore)
  } catch {
    ignore()
  }
}

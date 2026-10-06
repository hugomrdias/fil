import { useEffect, useRef } from 'react'
import { type ModelContextTool, registerTool } from '@/lib/webmcp'

/**
 * Register a WebMCP tool while the component is mounted. The tool is
 * registered once by name; each call runs the latest `execute`, so it reads
 * current state without re-registering on every render.
 *
 * @param tool - Tool definition.
 * @see https://webmachinelearning.github.io/webmcp/
 */
export function useWebMcpTool<Input>(tool: ModelContextTool<Input>) {
  const latest = useRef(tool)
  latest.current = tool
  const { name } = tool

  useEffect(() => {
    const controller = new AbortController()
    const { description, inputSchema, annotations } = latest.current
    registerTool<Input>(
      {
        name,
        description,
        inputSchema,
        ...(annotations ? { annotations } : {}),
        execute: (input, options) => latest.current.execute(input, options),
      },
      controller.signal
    )
    return () => controller.abort()
  }, [name])
}
